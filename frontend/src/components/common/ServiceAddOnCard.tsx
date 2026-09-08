import { Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

type ServiceAddOnCardProps = {
  id: number;
  name: string;
  price: number;
  is_active?: boolean;
  onEdit: (addOn: {
    id: number;
    name: string;
    price: number;
    is_active?: boolean;
  }) => void;
  onDelete: (id: number) => void;
};

export function ServiceAddOnCard({
  id,
  name,
  price,
  is_active,
  onEdit,
  onDelete,
}: ServiceAddOnCardProps) {
  return (
    <div className="relative flex flex-col justify-between rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <span
        className={cn(
          "absolute right-3 top-3 rounded-full px-2.5 py-1 text-xs font-medium",
          is_active === false
            ? "bg-gray-100 text-gray-500"
            : "bg-green-100 text-green-600",
        )}
      >
        {is_active === false ? "Inactive" : "Active"}
      </span>

      <div className="pr-16">
        <p className="text-base font-bold text-gray-900">{name}</p>
        <p className="mt-3 text-lg font-bold text-gray-900">
          ₱{price.toLocaleString()}
        </p>
      </div>

      <div className="mt-4 flex items-center gap-2 border-t border-gray-100 pt-3">
        <button
          type="button"
          onClick={() => onEdit({ id, name, price, is_active })}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-800 transition-colors hover:bg-gray-50"
        >
          <Pencil className="h-4 w-4" strokeWidth={2} />
          Edit
        </button>
        <button
          type="button"
          onClick={() => onDelete(id)}
          aria-label={"Delete " + name}
          className="rounded-lg bg-red-500 p-2 text-white transition-colors hover:bg-red-600"
        >
          <Trash2 className="h-5 w-5" strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}
