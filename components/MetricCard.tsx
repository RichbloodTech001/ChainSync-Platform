export default function MetricCard({ title, value, note, icon, tone }: { title: string; value: string; note: string; icon: string; tone?: "alert" | "good" }) {
  return <article className={tone ? `metric tone-${tone}` : "metric"}>
    <span className="metric-icon">{icon}</span>
    <small>{title}</small>
    <strong>{value}</strong>
    <p>{note}</p>
  </article>;
}
