import {describe, expect, it} from 'vitest';
import {ActivityReport} from '../../src/notifications/reports/activity-report';

describe('ActivityReport', () => {
  const periodStart = new Date('2026-04-04T08:00:00.000Z');
  const periodEnd = new Date('2026-04-11T08:00:00.000Z');

  function build(overrides: Partial<Parameters<typeof ActivityReport.build>[0]> = {}) {
    return ActivityReport.build({
      network: 'mainnet',
      totalUsers: 1234,
      totalTransactions: 56789,
      newUsers: 42,
      newTransactions: 1337,
      periodStart,
      periodEnd,
      ...overrides,
    });
  }

  it('posts to the #reporting Slack channel', () => {
    const msg = build();
    expect(msg.channel).toBe('#reporting');
  });

  it('uses info severity', () => {
    const msg = build();
    expect(msg.severity).toBe('info');
  });

  it('has a recognizable title', () => {
    const msg = build();
    expect(msg.title).toBe('BIM Activity Report');
  });

  it('renders the period header and activity metrics in description', () => {
    const msg = build();
    expect(msg.description).toBe(
      '*From 2026-04-04 to 2026-04-11*\n' +
      '    New users: 42\n' +
      '    New transactions: 1,337\n' +
      '\n' +
      '*All time*\n' +
      '    Total users: 1,234\n' +
      '    Total transactions: 56,789',
    );
  });

  it('has no structured fields (everything lives in description)', () => {
    const msg = build();
    expect(msg.fields.size).toBe(0);
  });

  it('tags context with the network', () => {
    const msg = build({network: 'testnet'});
    expect(msg.context).toBe('bim-reporting testnet');
  });
});
