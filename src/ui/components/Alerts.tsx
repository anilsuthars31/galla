import type { Alert, AlertLevel } from '../../engine';
import { Icon } from './Icons';

const LEVEL: Record<AlertLevel, string> = { critical: 'Act now', warning: 'Watch', good: 'Good', info: 'Note' };
const ICON = { critical: Icon.critical, warning: Icon.warning, good: Icon.good, info: Icon.info };

export function Alerts({ alerts }: { alerts: Alert[] }) {
  const urgent = alerts.filter((a) => a.level === 'critical').length;
  return (
    <div className="panel">
      <div className="phead">
        <div>
          <h2>What needs attention</h2>
          <p>Checked against the forecast and your latest full month.</p>
        </div>
        {urgent > 0 && <span className="pill critical">{urgent} to act on</span>}
      </div>
      <div className="alerts">
        {alerts.length ? (
          alerts.map((a, i) => {
            const I = ICON[a.level];
            return (
              <div key={a.title} className={`al ${a.level}`} style={{ animationDelay: `${i * 50}ms` }}>
                <span className="ic" title={LEVEL[a.level]}>
                  <I />
                </span>
                <div>
                  <b>{a.title}</b>
                  <p>
                    <span className="lvl">{LEVEL[a.level]}.</span> {a.body}
                  </p>
                </div>
              </div>
            );
          })
        ) : (
          <div className="al good">
            <span className="ic">
              <Icon.good />
            </span>
            <div>
              <b>Nothing unusual</b>
              <p>Next month looks positive and spending is at its usual level.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
