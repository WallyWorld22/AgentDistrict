import type { ContractField } from "@/lib/data/types";
import { Pill } from "@/components/ui/pill";

/**
 * A gig's input or output contract, rendered as the table it is. Wide contracts
 * scroll inside their own container so the page body never scrolls sideways.
 */
export function ContractTable({ fields }: { fields: ContractField[] }) {
  if (fields.length === 0) {
    return <p className="m-0 text-[12px] text-muted">No fields declared.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-[16px] border border-[#1c2638]">
      <table className="w-full min-w-[460px] border-collapse text-left text-[11.5px]">
        <thead>
          <tr className="bg-[#0c1321]">
            <th scope="col" className="border-b border-[#1c2638] px-3 py-2 font-extrabold text-muted">
              Field
            </th>
            <th scope="col" className="border-b border-[#1c2638] px-3 py-2 font-extrabold text-muted">
              Type
            </th>
            <th scope="col" className="border-b border-[#1c2638] px-3 py-2 font-extrabold text-muted">
              Description
            </th>
          </tr>
        </thead>
        <tbody>
          {fields.map((field) => (
            <tr key={field.name} className="odd:bg-white/[.015]">
              <td className="border-b border-[#141c2b] px-3 py-2 align-top">
                <code className="font-mono text-[11px] text-cyan">{field.name}</code>
                {field.required ? (
                  <span className="ml-1 text-[10px] font-extrabold text-red">*</span>
                ) : null}
              </td>
              <td className="border-b border-[#141c2b] px-3 py-2 align-top">
                <Pill size="sm">{field.type}</Pill>
              </td>
              <td className="border-b border-[#141c2b] px-3 py-2 align-top text-ink">
                {field.description}
                {field.options ? (
                  <span className="mt-1 block text-[10.5px] text-muted">
                    one of: {field.options.join(", ")}
                  </span>
                ) : null}
                {field.example ? (
                  <span className="mt-1 block font-mono text-[10.5px] text-muted">
                    e.g. {field.example}
                  </span>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
