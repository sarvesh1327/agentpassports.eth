export type StatusBannerProps = {
  details?: string | null;
  message: string;
  title: string;
  variant: "idle" | "loading" | "success" | "error";
};

/**
 * Gives every form the same visible loading, success, and error treatment.
 */
export function StatusBanner(props: StatusBannerProps) {
  return (
    <div className={`status-banner status-banner--${props.variant}`} role={props.variant === "error" ? "alert" : "status"}>
      <strong>{props.title}</strong>
      <span>{props.message}</span>
      {props.details ? <small>{props.details}</small> : null}
    </div>
  );
}
