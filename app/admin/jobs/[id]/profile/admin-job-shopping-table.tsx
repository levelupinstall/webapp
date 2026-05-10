import type { ShoppingListRowDisplay } from "@/lib/admin-job-profile-display";

export function AdminJobShoppingTable({
  rows,
  dense,
}: {
  rows: ShoppingListRowDisplay[];
  dense?: boolean;
}) {
  if (rows.length === 0) {
    return <p className="mt-4 text-sm text-zinc-500">No materials line items on this job.</p>;
  }

  const cell = dense ? "py-2 pr-3" : "py-3 pr-4";

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="border-b border-zinc-700 text-xs uppercase tracking-wide text-zinc-500">
          <tr>
            <th className={`${cell} font-medium`}>Material</th>
            <th className={`${cell} font-medium`}>Qty</th>
            <th className={`${cell} font-medium`}>Live price (Gemini)</th>
            <th className={`${cell} font-medium`}>Sourcing</th>
            <th className={`${dense ? "py-2" : "py-3"} font-medium`}>Notes</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800">
          {rows.map((row, i) => (
            <tr key={i} className="align-top text-zinc-300">
              <td className={`${cell} font-medium text-zinc-100`}>{row.description}</td>
              <td className={`${cell} tabular-nums`}>{row.qty}</td>
              <td className={`${cell} tabular-nums`}>{row.retailCad}</td>
              <td className={cell}>
                <a
                  href={row.sourcingHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-teal-400 underline hover:text-teal-300"
                >
                  {row.sourcingLabel}
                </a>
              </td>
              <td className={`${dense ? "py-2" : "py-3"} text-xs text-zinc-500`}>{row.notes}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
