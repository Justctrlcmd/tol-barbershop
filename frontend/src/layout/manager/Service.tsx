"use client";

import { useState, useEffect } from "react";
import { Plus, AlertTriangle } from "lucide-react";
import { ServiceForm } from "@/forms/ServiceForm";
import { ServiceAddOnForm } from "@/forms/ServiceAddOnForm";
import { ServiceSchemaFormValues } from "@/validations/service.validation";
import { type AddOnSchemaFormValues } from "@/validations/add-on.validation";
import { ServicesCard } from "@/components/common/ServicesCard";
import { ServiceAddOnCard } from "@/components/common/ServiceAddOnCard";
import { useManagementModuleHeaderActions } from "@/layout/manager/ManagementModulePage";
import {
  getServices,
  createService,
  updateService,
  deleteService,
  type Service,
} from "@/services/manager/service.api";
import {
  createServiceAddOn,
  deleteServiceAddOn,
  getServiceAddOns,
  updateServiceAddOn,
  type ServiceAddOn,
} from "@/services/manager/add-on.api";
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

export function Service() {
  const { setHeaderActions } = useManagementModuleHeaderActions();
  const [services, setServices] = useState<Service[]>([]);
  const [addOns, setAddOns] = useState<ServiceAddOn[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [serviceToDelete, setServiceToDelete] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showAddOnModal, setShowAddOnModal] = useState(false);
  const [editingAddOn, setEditingAddOn] = useState<ServiceAddOn | null>(null);
  const [deleteAddOnConfirmOpen, setDeleteAddOnConfirmOpen] = useState(false);
  const [addOnToDelete, setAddOnToDelete] = useState<number | null>(null);
  const [isDeletingAddOn, setIsDeletingAddOn] = useState(false);

  useEffect(() => {
    loadServices();
  }, []);

  const loadServices = async () => {
    try {
      setLoading(true);
      const [serviceData, addOnData] = await Promise.all([
        getServices(),
        getServiceAddOns(),
      ]);
      setServices(serviceData);
      setAddOns(addOnData);
    } catch (error) {
      console.error("Failed to load services:", error);
    } finally {
      setLoading(false);
    }
  };

  const openAddOnModal = () => {
    setEditingAddOn(null);
    setShowAddOnModal(true);
  };

  const openEditAddOnModal = (addOn: {
    id: number;
    name: string;
    price: number;
    is_active?: boolean;
  }) => {
    setEditingAddOn({
      ...addOn,
      is_active: isActiveValue(addOn.is_active),
      created_at: "",
      updated_at: "",
    });
    setShowAddOnModal(true);
  };

  const closeAddOnModal = () => {
    setShowAddOnModal(false);
    setEditingAddOn(null);
  };

  const openAddModal = () => {
    setEditingService(null);
    setShowModal(true);
  };

  useEffect(() => {
    setHeaderActions(
      <button
        type="button"
        onClick={openAddModal}
        className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-red-500 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-red-600 md:hidden"
      >
        <Plus className="size-4" />
        Add Service
      </button>,
    );

    return () => setHeaderActions(null);
  }, [setHeaderActions]);

  const openEditModal = (service: Service) => {
    setEditingService(service);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingService(null);
  };

  const handleSubmit = async (data: ServiceSchemaFormValues) => {
    try {
      if (editingService) {
        await updateService(editingService.id, data);
        toast.success("Service updated successfully");
      } else {
        await createService(data);
        toast.success("Service added successfully");
      }
      await loadServices();
      closeModal();
    } catch (error) {
      console.error("Failed to save service:", error);
      toast.error(error instanceof Error ? error.message : "Could not save service. Please try again.");
    }
  };

  const handleDelete = async (id: number) => {
    setServiceToDelete(id);
    setDeleteConfirmOpen(true);
  };

  const handleAddOnSubmit = async (data: AddOnSchemaFormValues): Promise<boolean> => {
    try {
      if (editingAddOn) {
        await updateServiceAddOn(editingAddOn.id, data);
        toast.success("Add-on updated successfully");
      } else {
        await createServiceAddOn(data);
        toast.success("Add-on added successfully");
      }
      await loadServices();
      closeAddOnModal();
      return true;
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not save add-on. Please try again.",
      );
      return false;
    }
  };

  const handleAddOnDelete = (id: number) => {
    setAddOnToDelete(id);
    setDeleteAddOnConfirmOpen(true);
  };

  const confirmAddOnDelete = async () => {
    if (!addOnToDelete || isDeletingAddOn) return;
    setIsDeletingAddOn(true);
    try {
      await deleteServiceAddOn(addOnToDelete);
      await loadServices();
      setDeleteAddOnConfirmOpen(false);
      setAddOnToDelete(null);
      toast.success("Add-on deleted");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not delete add-on. Please try again.",
      );
    } finally {
      setIsDeletingAddOn(false);
    }
  };

  const confirmDelete = async () => {
    if (!serviceToDelete || isDeleting) return;
    setIsDeleting(true);
    try {
      await deleteService(serviceToDelete);
      await loadServices();
      setDeleteConfirmOpen(false);
      setServiceToDelete(null);
      toast.success("Service deleted");
    } catch (error) {
      console.error("Failed to delete service:", error);
      toast.error(error instanceof Error ? error.message : "Could not delete service. Please try again.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="w-full h-full p-4 sm:p-6 pb-12 sm:pb-10 font-sans">
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <p className="text-gray-500">Loading services...</p>
        </div>
      ) : (
        <div className="space-y-8">
          <section>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Services</h2>
                <p className="text-sm text-gray-500">Main services customers can book.</p>
              </div>
              <button
                type="button"
                onClick={openAddModal}
                className="hidden items-center gap-1.5 rounded-lg bg-red-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-red-600 md:flex"
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
                Add Service
              </button>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {services.map((service) => (
                <ServicesCard
                  key={service.id}
                  id={service.id}
                  name={service.name}
                  description={service.description}
                  duration={service.duration}
                  price={service.price}
                  is_active={isActiveValue(service.is_active)}
                  onEdit={openEditModal}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Add-ons</h2>
                <p className="text-sm text-gray-500">
                  Optional extras staff can apply to confirmed bookings.
                </p>
              </div>
              <button
                onClick={openAddOnModal}
                className="flex items-center gap-1.5 rounded-lg bg-red-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-red-600"
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
                <span className="hidden xs:inline">Add Add-on</span>
                <span className="xs:hidden">Add</span>
              </button>
            </div>
            {addOns.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
                No add-ons yet. Add one to make optional services available to staff.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {addOns.map((addOn) => (
                  <ServiceAddOnCard
                    key={addOn.id}
                    id={addOn.id}
                    name={addOn.name}
                    price={Number(addOn.price)}
                    is_active={isActiveValue(addOn.is_active)}
                    onEdit={openEditAddOnModal}
                    onDelete={handleAddOnDelete}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      <ServiceForm
        open={showModal}
        onClose={closeModal}
        onSubmit={handleSubmit}
        initialData={
          editingService
            ? {
                name: editingService.name,
                description: editingService.description,
                duration: editingService.duration,
                price: editingService.price,
                is_active: isActiveValue(editingService.is_active),
              }
            : undefined
        }
        title={editingService ? "Edit Service" : "Add New Service"}
      />

      <ServiceAddOnForm
        open={showAddOnModal}
        onClose={closeAddOnModal}
        onSubmit={handleAddOnSubmit}
        initialData={
          editingAddOn
            ? {
                name: editingAddOn.name,
                price: Number(editingAddOn.price),
                is_active: isActiveValue(editingAddOn.is_active),
              }
            : undefined
        }
        title={editingAddOn ? "Edit Add-on" : "Add New Add-on"}
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
              Delete Service
            </DialogTitle>
            <DialogDescription>
              Delete this service? It will be removed from service lists, while
              existing booking and reporting history will be retained.
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

      <Dialog
        open={deleteAddOnConfirmOpen}
        onOpenChange={(open) => {
          if (!isDeletingAddOn) setDeleteAddOnConfirmOpen(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              Delete Add-on
            </DialogTitle>
            <DialogDescription>
              Delete this add-on? It will be removed from add-on lists, while
              existing booking and reporting history will be retained.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteAddOnConfirmOpen(false)}
              disabled={isDeletingAddOn}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={confirmAddOnDelete}
              disabled={isDeletingAddOn}
              className="bg-red-500 text-white hover:bg-red-600"
            >
              {isDeletingAddOn ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
