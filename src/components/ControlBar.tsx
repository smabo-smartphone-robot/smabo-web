import { useBrain } from '../store/useBrain';
import { brain } from '../ws/brain';

/** True while another tab drives: this tab's drive and arm controls are off. */
export function useControlLocked(): boolean {
  const control = useBrain(s => s.control);
  return !!control && control.holder !== null && !control.you;
}

/**
 * Who drives the robot (smabo-brain lets one tab at a time send /cmd_vel and
 * /servo/command). Shows "<name> is driving" with Take over in the other
 * tabs, and Release in the tab that drives. Nothing when the brain does not
 * do this or nobody drives (the first tab to move the robot takes control).
 */
export function ControlBar() {
  const control = useBrain(s => s.control);
  const myName = useBrain(s => s.brainAuth?.name);
  if (!control || control.holder === null) return null;
  if (control.you) {
    return (
      <div className="control-bar control-bar--you" role="status">
        <span>You are driving{control.holder ? ` (${control.holder})` : ''}</span>
        <button onClick={() => brain.releaseControl()}>Release</button>
      </div>
    );
  }
  return (
    <div className="control-bar control-bar--other" role="status">
      <span>
        {/* Tabs of one browser share its pairing name */}
        {control.holder === myName ? 'Another tab of this browser' : <b>{control.holder}</b>} is driving.
        Watching only; STOP still works.
      </span>
      <button className="primary" onClick={() => brain.claimControl()}>Take over</button>
    </div>
  );
}
