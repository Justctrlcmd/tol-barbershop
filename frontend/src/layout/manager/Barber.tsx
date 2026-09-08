"use client";

import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import { Plus, AlertTriangle, Mail, Pencil, Phone, Trash2, User } from "lucide-react";
import { BarberForm } from "@/forms/BarberForm";
import { useManagementModuleHeaderActions } from "@/layout/manager/ManagementModulePage";
import { BarberSchemaFormValues } from "@/validations/staff.validation";
import {
  getBarbers,
  createBarber,
  updateBarber,
  deleteBarber,
  type Barber,
} from "@/services/manager/barber.api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const isActiveValue = (value: unknown): boolean => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "1" || normalized === "true";
  }
  return false;
};

function BarberCard({
  barber,
  onEdit,
  onDelete,
}: {
  barber: Barber;
  onEdit: (barber: Barber) => void;
  onDelete: (id: number) => void;
}) {
  const active = isActiveValue(barber.is_active);

  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 flex flex-col justify-between relative">
      <div className="absolute top-3 right-3">
        <span
          className={cn(
            "text-xs font-medium px-2.5 py-1 rounded-full",
            active ? "bg-green-100 text-green-600" : "bg-gray-100 text-gray-500",
          )}
        >
          {active ? "Active" : "Inactive"}
        </span>
      </div>

      <div>
        <div className="flex items-center gap-3 mb-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full border border-blue-100 bg-blue-50">
            <User className="size-5 text-blue-500" />
          </div>
          <p className="font-bold text-gray-900 text-base">{barber.fullname}</p>
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Mail className="w-4 h-4 shrink-0" />
            <span className="truncate">{barber.email}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Phone className="w-4 h-4 shrink-0" />
            <span>{barber.contact_number}</span>
          </div>
        </div>
      </div>

      <div className="border-t border-gray-100 pt-3 mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={() => onEdit(barber)}
          className="flex-1 flex items-center justify-center gap-2 border border-gray-200 rounded-lg px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 transition-colors"
        >
          <Pencil className="w-4 h-4" strokeWidth={2} />
          Edit
        </button>
        <button
          type="button"
          onClick={() => onDelete(barber.id)}
          aria-label={`Delete ${barber.fullname}`}
          className="bg-red-500 hover:bg-red-600 transition-colors text-white rounded-lg p-2"
        >
          <Trash2 className="w-5 h-5" strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}

export function Barber() {
  const { setHeaderActions } = useManagementModuleHeaderActions();
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingBarber, setEditingBarber] = useState<Barber | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [barberToDelete, setBarberToDelete] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    loadBarbers();
  }, []);

  const loadBarbers = async () => {
    try {
      setLoading(true);
      const data = await getBarbers();
      setBarbers(data);
    } catch (error) {
      console.error("Failed to load barbers:", error);
    } finally {
      setLoading(false);
    }
  };

  const openAddModal = () => {
    setEditingBarber(null);
    setShowModal(true);
  };

  useEffect(() => {
    setHeaderActions(
      <button
        type="button"
        onClick={openAddModal}
        className="flex items-center gap-1.5 rounded-lg bg-red-500 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-red-600"
      >
        <Plus className="size-4" />
        Add Barber
      </button>,
    );

    return () => setHeaderActions(null);
  }, [setHeaderActions]);

  const openEditModal = (barber: Barber) => {
    setEditingBarber(barber);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingBarber(null);
  };

  const handleSubmit = async (data: BarberSchemaFormValues) => {
    try {
      if (editingBarber) {
        await updateBarber(editingBarber.id, data);
        toast.success("Barber profile updated");
      } else {
        await createBarber(data);
        toast.success("Barber added successfully");
      }
      await loadBarbers();
      closeModal();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save barber. Please try again.");
    }
  };

  const handleDelete = async (id: number) => {
    setBarberToDelete(id);
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!barberToDelete || isDeleting) return;
    setIsDeleting(true);
    try {
      await deleteBarber(barberToDelete);
      await loadBarbers();
      setDeleteConfirmOpen(false);
      setBarberToDelete(null);
      toast.success("Barber removed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete barber. Please try again.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="w-full h-full p-4 sm:p-6 pb-12 sm:pb-10 font-sans">
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <p className="text-gray-500">Loading barbers...</p>
        </div>
      ) : barbers.length === 0 ? (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="py-10 text-center text-gray-500">No barbers found.</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {barbers.map((barber) => (
            <BarberCard
              key={barber.id}
              barber={barber}
              onEdit={openEditModal}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      <BarberForm
        open={showModal}
        onClose={closeModal}
        onSubmit={handleSubmit}
        initialData={
          editingBarber
            ? {
                fullname: editingBarber.fullname,
                email: editingBarber.email,
                contact_number: editingBarber.contact_number,
                is_active: isActiveValue(editingBarber.is_active),
              }
            : undefined
        }
        title={editingBarber ? "Edit Barber" : "Add New Barber"}
      />

      <Dialog
        open={deleteConfirmOpen}
        onOpenChange={(open) => {
          if (!isDeleting) setDeleteConfirmOpen(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              Delete Barber
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this barber? This action cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteConfirmOpen(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={confirmDelete}
              disabled={isDeleting}
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
