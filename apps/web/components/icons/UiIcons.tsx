import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & {
  size?: number;
  title?: string;
};

type BrandLogoProps = {
  className?: string;
  size?: number;
  title?: string;
};

type UiIconName =
  | "arrow-left"
  | "check"
  | "copy"
  | "document"
  | "download"
  | "edit"
  | "external"
  | "eye"
  | "gas"
  | "grid"
  | "list"
  | "plus"
  | "queue"
  | "shield"
  | "trash"
  | "wallet"
  | "warning";

export function AgentPassportsLogo({ className, size = 32, title = "AgentPassports" }: BrandLogoProps) {
  return (
    <img
      alt={title}
      className={["agentpassports-logo-image", className].filter(Boolean).join(" ")}
      height={size}
      src="/brand/agentpassports-logo.png"
      width={size}
    />
  );
}

export function AgentBotIcon(props: IconProps) {
  return (
    <svg {...svgProps(props)} viewBox="0 0 32 32">
      {props.title ? <title>{props.title}</title> : null}
      <path d="M16 4.7v4.1" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2.3" />
      <circle cx="16" cy="3.8" r="1.7" fill="currentColor" />
      <rect x="7.2" y="9.5" width="17.6" height="14.6" rx="4.2" fill="#dcfce7" stroke="currentColor" strokeWidth="2.25" />
      <path d="M4.5 15.8v5.4M27.5 15.8v5.4M11.8 27h8.4" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2.25" />
      <circle cx="13" cy="16.9" r="1.9" fill="currentColor" />
      <circle cx="19" cy="16.9" r="1.9" fill="currentColor" />
      <path d="M12.8 21h6.4" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2.25" />
    </svg>
  );
}

export function SwapperAgentIcon(props: IconProps) {
  return (
    <svg {...svgProps(props)} viewBox="0 0 32 32">
      {props.title ? <title>{props.title}</title> : null}
      <path d="M8 11h15l-4-4M24 21H9l4 4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.4" />
    </svg>
  );
}

export function ResearcherAgentIcon(props: IconProps) {
  return (
    <svg {...svgProps(props)} viewBox="0 0 32 32">
      {props.title ? <title>{props.title}</title> : null}
      <circle cx="14" cy="14" r="7" fill="none" stroke="currentColor" strokeWidth="2.3" />
      <path d="m19.2 19.2 6 6" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2.3" />
    </svg>
  );
}

export function EnsIndexIcon(props: IconProps) {
  return (
    <svg {...svgProps(props)} viewBox="0 0 32 32">
      {props.title ? <title>{props.title}</title> : null}
      <path d="m13 7-5 9h7l-3 9 12-13h-8l3-5h-6Z" fill="currentColor" />
    </svg>
  );
}

export function UiIcon({ name, ...props }: IconProps & { name: UiIconName }) {
  const common = svgProps(props);

  return (
    <svg {...common} viewBox="0 0 24 24">
      {props.title ? <title>{props.title}</title> : null}
      {iconPath(name)}
    </svg>
  );
}

function iconPath(name: UiIconName) {
  switch (name) {
    case "arrow-left":
      return <path d="M19 12H5m6-6-6 6 6 6" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />;
    case "check":
      return <path d="m5 12 4 4L19 6" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />;
    case "copy":
      return <path d="M9 9h10v10H9zM5 15V5h10" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />;
    case "document":
      return <path d="M7 3h7l4 4v14H7zM14 3v5h5M9 12h6M9 16h6" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />;
    case "download":
      return <path d="M12 3v12m0 0 5-5m-5 5-5-5M5 21h14" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />;
    case "edit":
      return <path d="M4 20h4L19 9l-4-4L4 16v4ZM13.5 6.5l4 4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />;
    case "external":
      return <path d="M14 4h6v6M20 4l-9 9M19 14v5H5V5h5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />;
    case "eye":
      return <><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="2" /><circle cx="12" cy="12" r="2.5" fill="none" stroke="currentColor" strokeWidth="2" /></>;
    case "gas":
      return <path d="M5 21V4h9v17M7 8h5M14 10h3l2 2v6a2 2 0 0 1-4 0v-4h-1M4 21h11" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />;
    case "grid":
      return <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="2" />;
    case "list":
      return <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2.4" />;
    case "plus":
      return <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />;
    case "queue":
      return <path d="M5 6h14M5 12h14M5 18h8" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />;
    case "shield":
      return <path d="M12 3 5 6v5c0 4.5 2.8 8.4 7 10 4.2-1.6 7-5.5 7-10V6l-7-3Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="2" />;
    case "trash":
      return <path d="M4 7h16M10 11v6M14 11v6M6 7l1 14h10l1-14M9 7l1-3h4l1 3" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />;
    case "wallet":
      return <path d="M4 7h15a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h12M16 13h5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />;
    case "warning":
      return <path d="M12 4 2.5 20h19L12 4Zm0 6v4m0 3h.01" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />;
  }
}

function svgProps(props: IconProps): SVGProps<SVGSVGElement> {
  const { size = 20, title: _title, ...rest } = props;

  return {
    "aria-hidden": props.title ? undefined : true,
    focusable: "false",
    height: size,
    width: size,
    ...rest
  };
}
