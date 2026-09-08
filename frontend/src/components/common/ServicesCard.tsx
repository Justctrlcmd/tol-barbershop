import { cn } from "@/lib/utils";
import { Clock, Pencil, Trash2 } from "lucide-react";

type ServiceCardProps = {
  id: number;
  name: string;
  description: string;
  duration: number;
  price: number;
  is_active?: boolean;
  onEdit: (service: {
    id: number;
    name: string;
    description: string;
    duration: number;
    price: number;
    is_active?: boolean;
  }) => void;
  onDelete: (id: number) => void;
}

export function ServicesCard({
  id,
  name,
  description,
  duration,
  price,
  is_active,
  onEdit,
  onDelete,
}: ServiceCardProps) {
  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 flex flex-col justify-between relative">
      <div className="absolute top-3 right-3">
        <span
          className={cn("text-xs font-medium px-2.5 py-1 rounded-full", is_active === false ? "bg-gray-100 text-gray-500" : "bg-green-100 text-green-600")}
        >
          {is_active === false ? "Inactive" : "Active"}
        </span>
      </div>

      <div>
        <p className="font-bold text-gray-900 text-base">{name}</p>
        <p className="text-gray-500 text-sm mt-1">{description}</p>
      </div>
      <div>
        <div className="flex items-center justify-between mt-4 mb-3">
          <span className="flex items-center gap-1.5 text-gray-500 text-sm">
            <Clock className="w-4 h-4" strokeWidth={1.8} />
            {duration} mins
          </span>
          <span className="flex items-center gap-1 font-bold text-gray-900 text-lg">
            ₱{price}
          </span>
        </div>
        <div className="border-t border-gray-100 pt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() =>
              onEdit({ id, name, description, duration, price, is_active })
            }
            className="flex-1 flex items-center justify-center gap-2 border border-gray-200 rounded-lg px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 transition-colors"
          >
            <Pencil className="w-4 h-4" strokeWidth={2} />
            Edit
          </button>
          <button
            type="button"
            onClick={() => onDelete(id)}
            aria-label={`Delete ${name}`}
            className="bg-red-500 hover:bg-red-600 transition-colors text-white rounded-lg p-2"
          >
            <Trash2 className="w-5 h-5" strokeWidth={2} />
          </button>
        </div>
      </div>
    </div>
  );
}
