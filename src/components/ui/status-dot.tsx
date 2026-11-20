import { Badge } from "./badge";

type Status = "present" | "absent" | "late" | "excused" | "active" | "pending";

const labels: Record<Status, string> = {
  present: "حاضر",
  absent: "غایب",
  late: "تأخیر",
  excused: "موجه",
  active: "فعال",
  pending: "در انتظار",
};

const tones: Record<Status, "success" | "danger" | "warning" | "info" | "neutral"> = {
  present: "success",
  absent: "danger",
  late: "warning",
  excused: "info",
  active: "success",
  pending: "neutral",
};

export function StatusBadge({ status }: { status: Status }) {
  return <Badge tone={tones[status]}><span className="size-1.5 rounded-full bg-current" aria-hidden="true" />{labels[status]}</Badge>;
}
