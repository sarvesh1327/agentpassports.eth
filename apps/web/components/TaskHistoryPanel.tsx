import type { TaskHistoryItem } from "../lib/taskHistory";
import { shortenHex } from "./EnsProofPanel";

export type TaskHistoryPanelProps = {
  cardClassName?: string;
  emptyDescription: string;
  emptyTitle?: string;
  eyebrow: string;
  headingId: string;
  tasks: readonly TaskHistoryItem[];
  title: string;
};

/**
 * Renders TaskRecorded events in the shared history format used by agent and run pages.
 */
export function TaskHistoryPanel(props: TaskHistoryPanelProps) {
  const emptyTitle = props.emptyTitle ?? "No task proofs recorded";

  return (
    <section className={props.cardClassName ?? "app-card"} aria-labelledby={props.headingId}>
      <div className="section-heading">
        <p>{props.eyebrow}</p>
        <h2 id={props.headingId}>{props.title}</h2>
      </div>
      {props.tasks.length > 0 ? (
        <div className="record-table" role="table" aria-label="Task history">
          {props.tasks.map((task) => (
            <div className="record-table__row" role="row" key={task.id}>
              <span role="cell">{task.timestamp}</span>
              <strong role="cell">
                {shortenHex(task.taskHash)} {task.metadataURI}
              </strong>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <strong>{emptyTitle}</strong>
          <span>{props.emptyDescription}</span>
        </div>
      )}
    </section>
  );
}
