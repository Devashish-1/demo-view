import React, { useState } from 'react';
import {
  ArrowUpRight,
  TrendingUp,
  Users,
  BriefcaseBusiness,
  MessageSquare,
  CheckCircle2,
  ArrowRight,
  Plus,
  X,
  CalendarDays,
} from 'lucide-react';
import { Dialog, Field, ActionForm } from './components.jsx';
import './demo.css';
const initialDeals = [
  {
    name: 'Northstar · Annual logistics',
    company: 'Northstar Freight',
    contact: 'Rohan Malhotra',
    value: 480000,
    stage: 'Negotiation',
    owner: 'Priya Sharma',
    color: '#397e66',
  },
  {
    name: 'Meridian · Warehouse expansion',
    company: 'Meridian Retail',
    contact: 'Aditi Shah',
    value: 325000,
    stage: 'Proposal',
    owner: 'Arjun Patel',
    color: '#b78740',
  },
  {
    name: 'Bluebird · Distribution contract',
    company: 'Bluebird Foods',
    contact: 'Karan Sethi',
    value: 210000,
    stage: 'Qualified',
    owner: 'Neha Kapoor',
    color: '#7e75b1',
  },
  {
    name: 'Apex · Regional transport',
    company: 'Apex Manufacturing',
    contact: 'Vivek Rao',
    value: 650000,
    stage: 'Won',
    owner: 'Priya Sharma',
    color: '#397e66',
  },
  {
    name: 'UrbanNest · Last-mile delivery',
    company: 'UrbanNest',
    contact: 'Sana Khan',
    value: 180000,
    stage: 'New lead',
    owner: 'Arjun Patel',
    color: '#548aab',
  },
];
const rupees = (n) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(n);
export default function DemoDashboard({ user, onBoards, onChat, onReports }) {
  const [period, setPeriod] = useState('30'),
    [deals, setDeals] = useState(initialDeals),
    [selected, setSelected] = useState(null),
    [create, setCreate] = useState(false),
    [guide, setGuide] = useState(false),
    [done, setDone] = useState([]);
  const multiplier = period === '7' ? 0.28 : period === '90' ? 2.6 : 1;
  const stages = ['New lead', 'Qualified', 'Proposal', 'Negotiation', 'Won'];
  const tasks = [
    'Send revised quote to Northstar',
    'Follow up on Meridian proposal',
    'Confirm Apex onboarding meeting',
  ];
  return (
    <div className="relay-demo">
      <div className="demo-banner">
        <span>
          <i /> DEMO WORKSPACE
        </span>
        <p>Sample data to explore your CRM. These numbers are not your live business totals.</p>
        <button onClick={() => setGuide(!guide)}>How does this work? {guide ? '−' : '+'}</button>
      </div>
      <header className="demo-heading">
        <div>
          <span className="demo-eyebrow">YOUR BUSINESS, AT A GLANCE</span>
          <h1>
            Good day, {user.name.split(' ')[0]} <span className="wave">✦</span>
          </h1>
          <p>Every opportunity. Every conversation. One clear view.</p>
        </div>
        <div className="demo-actions">
          <select
            aria-label="Dashboard period"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
          >
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
          </select>
          <button className="demo-primary" onClick={() => setCreate(true)}>
            <Plus size={16} /> Add demo deal
          </button>
        </div>
      </header>
      {guide && (
        <section className="demo-guide">
          <h2>Your CRM in four simple steps</h2>
          <div>
            {[
              ['01', 'Capture a lead', 'Add or import a potential customer.'],
              ['02', 'Build a relationship', 'Connect the company, contact and deal.'],
              ['03', 'Follow up together', 'Chat with your team and track the next task.'],
              ['04', 'Close & measure', 'Move the deal through stages and review results.'],
            ].map(([n, t, d]) => (
              <article key={n}>
                <b>{n}</b>
                <h3>{t}</h3>
                <p>{d}</p>
              </article>
            ))}
          </div>
          <button onClick={onBoards}>
            Open your real CRM boards <ArrowRight size={15} />
          </button>
        </section>
      )}
      <section className="demo-kpis" aria-label="Demo business metrics">
        {[
          [
            'Pipeline value',
            rupees(deals.filter((d) => d.stage !== 'Won').reduce((n, d) => n + d.value, 0)),
            '+18.4%',
            'Active opportunities',
            BriefcaseBusiness,
          ],
          [
            'Revenue won',
            rupees(Math.round(650000 * multiplier)),
            '+24.8%',
            `In the last ${period} days`,
            TrendingUp,
          ],
          ['New leads', Math.round(128 * multiplier), '+12.2%', 'Across all sources', Users],
          [
            'Conversations',
            Math.round(86 * multiplier),
            '+9.6%',
            'Team & customer messages',
            MessageSquare,
          ],
        ].map(([label, value, change, hint, Icon]) => (
          <article className="demo-card demo-kpi" key={label}>
            <div>
              <span>{label}</span>
              <i>
                <Icon size={19} />
              </i>
            </div>
            <strong>{value}</strong>
            <p>
              <b>
                <ArrowUpRight size={13} />
                {change}
              </b>{' '}
              {hint}
            </p>
          </article>
        ))}
      </section>
      <section className="demo-chart-grid">
        <article className="demo-card">
          <div className="demo-card-title">
            <div>
              <h2>Revenue overview</h2>
              <p>Won revenue against your monthly target</p>
            </div>
            <span className="demo-chip">Sample performance</span>
          </div>
          <div className="demo-chart">
            <div className="demo-axis">
              <span>₹8L</span>
              <span>₹6L</span>
              <span>₹4L</span>
              <span>₹2L</span>
            </div>
            <div className="demo-chart-body">
              <svg
                viewBox="0 0 600 180"
                role="img"
                aria-label="Demo revenue rises from April to September; revenue is compared with target"
              >
                <defs>
                  <linearGradient id="revenue-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#4c8b70" stopOpacity=".22" />
                    <stop offset="100%" stopColor="#4c8b70" stopOpacity="0" />
                  </linearGradient>
                </defs>
                {[20, 65, 110, 155].map((y) => (
                  <line
                    key={y}
                    x1="0"
                    y1={y}
                    x2="600"
                    y2={y}
                    stroke="#e9ede9"
                    strokeDasharray="4 4"
                  />
                ))}
                <path
                  d="M0 150 C60 155 60 95 120 105 S200 145 240 90 S315 110 360 65 S430 85 480 35 S550 45 600 12 L600 180 L0 180Z"
                  fill="url(#revenue-fill)"
                />
                <path
                  d="M0 120 L120 105 L240 80 L360 65 L480 45 L600 25"
                  fill="none"
                  stroke="#c1cbb5"
                  strokeWidth="2"
                  strokeDasharray="7 6"
                />
                <path
                  d="M0 150 C60 155 60 95 120 105 S200 145 240 90 S315 110 360 65 S430 85 480 35 S550 45 600 12"
                  fill="none"
                  stroke="#397e66"
                  strokeWidth="3"
                />
              </svg>
              <div className="demo-months">
                {['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'].map((m) => (
                  <span key={m}>{m}</span>
                ))}
              </div>
            </div>
          </div>
          <div className="demo-legend">
            <span>● Revenue</span>
            <span>◌ Target</span>
            <strong>{rupees(Math.round(650000 * multiplier))} won in selected period</strong>
          </div>
        </article>
        <article className="demo-card">
          <div className="demo-card-title">
            <div>
              <h2>Lead sources</h2>
              <p>Where your next customers find you</p>
            </div>
            <Users size={18} />
          </div>
          <div className="demo-source">
            <div
              className="demo-donut"
              role="img"
              aria-label="Website 42 percent, referrals 28 percent, campaigns 18 percent, direct 12 percent"
            >
              <div>
                <strong>{Math.round(128 * multiplier)}</strong>
                <span>new leads</span>
              </div>
            </div>
            <div>
              {[
                ['Website', 42, '#397e66'],
                ['Referrals', 28, '#a5bc88'],
                ['Campaigns', 18, '#d7bf82'],
                ['Direct', 12, '#dce5d5'],
              ].map(([n, v, c]) => (
                <p key={n}>
                  <i style={{ background: c }} />
                  {n}
                  <b>{v}%</b>
                </p>
              ))}
            </div>
          </div>
        </article>
      </section>
      <section className="demo-card">
        <div className="demo-card-title">
          <div>
            <h2>Sales pipeline</h2>
            <p>Click any opportunity to see the customer, owner and next step.</p>
          </div>
          <button onClick={onBoards}>
            Open real boards <ArrowUpRight size={15} />
          </button>
        </div>
        <div className="demo-pipeline">
          {stages.map((stage, i) => (
            <div key={stage}>
              <div className="demo-stage">
                <i
                  style={{ background: ['#6299b2', '#9180b7', '#c89b52', '#61987d', '#2d735b'][i] }}
                />
                <b>{stage}</b>
                <span>{deals.filter((d) => d.stage === stage).length}</span>
              </div>
              {deals
                .filter((d) => d.stage === stage)
                .map((d) => (
                  <button className="demo-deal" key={d.name} onClick={() => setSelected(d)}>
                    <small>{d.company}</small>
                    <strong>{d.name.split(' · ')[1] || d.name}</strong>
                    <b>{rupees(d.value)}</b>
                    <footer>
                      <span className="demo-avatar" style={{ background: d.color }}>
                        {d.owner
                          .split(' ')
                          .map((n) => n[0])
                          .join('')}
                      </span>
                      <span>{d.owner.split(' ')[0]}</span>
                      <ArrowUpRight size={14} />
                    </footer>
                  </button>
                ))}
            </div>
          ))}
        </div>
      </section>
      <section className="demo-bottom">
        <article className="demo-card">
          <div className="demo-card-title">
            <div>
              <h2>Your next moves</h2>
              <p>{tasks.length - done.length} follow-ups left in this demo</p>
            </div>
            <CalendarDays size={18} />
          </div>
          {tasks.map((t, i) => (
            <label className="demo-task" key={t}>
              <input
                type="checkbox"
                checked={done.includes(i)}
                onChange={() =>
                  setDone(done.includes(i) ? done.filter((v) => v !== i) : [...done, i])
                }
              />
              <span style={{ textDecoration: done.includes(i) ? 'line-through' : 'none' }}>
                {t}
                <small>{['Today, 11:30 AM', 'Today, 2:00 PM', 'Tomorrow, 10:00 AM'][i]}</small>
              </span>
              <span className="demo-chip">{i === 0 ? 'High priority' : 'Follow-up'}</span>
            </label>
          ))}
        </article>
        <article className="demo-card demo-chat-promo">
          <span className="demo-eyebrow">KEEP THE CONVERSATION GOING</span>
          <h2>
            Your team and customers,
            <br />
            in one inbox.
          </h2>
          <p>
            Explore direct messages, team channels and customer conversations. Try sending a demo
            reply.
          </p>
          <div className="demo-avatar-stack">
            {['PS', 'AP', 'NK', '+3'].map((n) => (
              <span key={n} className="demo-avatar">
                {n}
              </span>
            ))}
          </div>
          <button className="demo-primary" onClick={onChat}>
            <MessageSquare size={16} /> Open conversations <ArrowRight size={16} />
          </button>
        </article>
      </section>
      <footer className="demo-foot">
        <span>Demo workspace · Original lead records are unchanged.</span>
        <button onClick={onReports}>
          View actual lead reports <ArrowRight size={14} />
        </button>
      </footer>
      {create && (
        <Dialog title="Add a demo opportunity" onClose={() => setCreate(false)}>
          <p>This stays in the dashboard demo for this visit.</p>
          <ActionForm
            onClose={() => setCreate(false)}
            onSubmit={async (f) =>
              setDeals([
                ...deals,
                {
                  name: f.get('name'),
                  company: f.get('company'),
                  contact: 'Demo contact',
                  value: Number(f.get('value')),
                  stage: 'New lead',
                  owner: user.name,
                  color: '#397e66',
                },
              ])
            }
          >
            <Field label="Opportunity">
              <input name="name" required maxLength={100} />
            </Field>
            <Field label="Company">
              <input name="company" required maxLength={100} />
            </Field>
            <Field label="Value (INR)">
              <input name="value" type="number" required min="0" max="100000000" />
            </Field>
          </ActionForm>
        </Dialog>
      )}
      {selected && (
        <Dialog title={selected.name} onClose={() => setSelected(null)}>
          <span className="demo-chip">Demo opportunity</span>
          <dl className="demo-details">
            {[
              ['Company', selected.company],
              ['Contact', selected.contact],
              ['Deal value', rupees(selected.value)],
              ['Owner', selected.owner],
            ].map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          <Field label="Pipeline stage">
            <select
              value={selected.stage}
              onChange={(e) => {
                const next = { ...selected, stage: e.target.value };
                setSelected(next);
                setDeals(deals.map((d) => (d.name === selected.name ? next : d)));
              }}
            >
              {stages.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
          <p>Next step: confirm requirements and send the updated proposal.</p>
          <button
            className="demo-primary"
            onClick={() => {
              setSelected(null);
              onChat();
            }}
          >
            Discuss in chat <MessageSquare size={16} />
          </button>
        </Dialog>
      )}
    </div>
  );
}
