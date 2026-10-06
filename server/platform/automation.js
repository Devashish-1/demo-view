import { randomUUID } from 'node:crypto';
import { json, matches, stamp, fail } from './domain.js';
import { item, updateItem, notify, audit } from './store.js';
export async function runJobs(db, limit = 20, maxMilliseconds = 15000) {
  const deadline = Date.now() + maxMilliseconds;
  let processed = 0;
  // Each bounded job executes and commits under the DB transaction lock. A crash rolls it back.
  for (let i = 0; i < limit && Date.now() < deadline; i++) {
    let failedJobId;
    const handled = await db
      .tx(async (tx) => {
        const job = await tx.get(
          "SELECT * FROM p_jobs WHERE state='pending' AND due_at<=? ORDER BY created_at LIMIT 1",
          [stamp()],
        );
        if (!job) return false;
        failedJobId = job.id;
        const rule = await tx.get('SELECT * FROM p_rules WHERE id=?', [job.rule_id]);
        const user = await tx.get('SELECT id,role,active FROM users WHERE id=?', [rule.created_by]);
        let status = 'Skipped',
          result = 'Rule disabled or its creator no longer has manager access.';
        if (rule.enabled && user?.active && user.role !== 'agent') {
          const record = await item(tx, job.item_id, user);
          if (
            matches(json(rule.condition_json), {
              ...json(record.values_json),
              name: record.name,
              group_id: record.group_id,
              owner_id: record.owner_id,
            })
          ) {
            const action = json(rule.action_json);
            if (action.type === 'notify') {
              const recipient = await tx.get('SELECT id,role FROM users WHERE id=? AND active=1', [
                action.user_id || record.owner_id,
              ]);
              if (!recipient) fail('Notification recipient unavailable.');
              await item(tx, record.id, recipient);
              await notify(
                tx,
                action.user_id || record.owner_id,
                record.id,
                action.message || `${record.name} needs attention`,
              );
            } else if (action.type === 'update')
              await updateItem(tx, record.id, action.changes ?? {}, user, { emit: false });
            else if (action.type === 'comment')
              await tx.run(
                'INSERT INTO p_comments(id,item_id,user_id,body,created_at,updated_at) VALUES(?,?,?,?,?,?)',
                [
                  randomUUID(),
                  record.id,
                  user.id,
                  String(action.message).slice(0, 10000),
                  stamp(),
                  stamp(),
                ],
              );
            else fail('Unsupported automation action.');
            status = 'Success';
            result = 'Action completed; automation-generated changes do not trigger further rules.';
            await audit(tx, user, 'automation_executed', { rule_id: rule.id, item_id: record.id });
          } else result = 'Condition did not match.';
        }
        await tx.run('UPDATE p_jobs SET state=?,attempts=attempts+1 WHERE id=?', ['done', job.id]);
        await tx.run('INSERT INTO p_runs(id,job_id,status,result,created_at) VALUES(?,?,?,?,?)', [
          randomUUID(),
          job.id,
          status,
          result,
          stamp(),
        ]);
        return true;
      })
      .catch(async (error) => {
        if (!failedJobId) throw error;
        // The action transaction was rolled back; retry metadata is committed separately.
        await db.tx(async (tx) => {
          const job = await tx.get("SELECT * FROM p_jobs WHERE id=? AND state='pending'", [
            failedJobId,
          ]);
          if (!job) return;
          const attempt = job.attempts + 1;
          await tx.run('UPDATE p_jobs SET attempts=?,state=?,due_at=? WHERE id=?', [
            attempt,
            attempt >= 3 ? 'dead' : 'pending',
            new Date(Date.now() + 2 ** attempt * 60000).toISOString(),
            job.id,
          ]);
          await tx.run('INSERT INTO p_runs(id,job_id,status,result,created_at) VALUES(?,?,?,?,?)', [
            randomUUID(),
            job.id,
            'Failed',
            error.message.slice(0, 1000),
            stamp(),
          ]);
        });
        return true;
      });
    if (!handled) break;
    processed++;
  }
  return { processed };
}
