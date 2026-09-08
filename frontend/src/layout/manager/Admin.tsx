"use client";

import { useState, useEffect } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  AlertTriangle,
  Shield,
  Check,
  ChevronDown,
  UserCheck,
  UserRoundX,
  Users,
} from "lucide-react";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { AdminForm } from "@/forms/AdminForm";
import { AdminSchemaFormValues } from "@/validations/staff.validation";
import {
  getAdmins,
  createAdmin,
  updateAdmin,
  deleteAdmin,
  type Admin,
} from "@/services/manager/admin.api";
import {
  getRoles,
  createRole,
  updateRole,
  deleteRole,
  getModules,
  type Role,
  type Module,
} from "@/services/manager/role.api";
import { CheckboxWithLabel } from "@/components/common/CheckboxWithLabel";
import { InputWithLabel } from "@/components/common/InputWithLabel";
import { useManagementModuleHeaderActions } from "@/layout/manager/ManagementModulePage";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
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

export function Admin() {
  const { setHeaderActions } = useManagementModuleHeaderActions();
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [loading, setLoading] = useState(true);

  const [showAdminModal, setShowAdminModal] = useState(false);
  const [editingAdmin, setEditingAdmin] = useState<Admin | null>(null);

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [adminToDelete, setAdminToDelete] = useState<number | null>(null);
  const [isDeletingAdmin, setIsDeletingAdmin] = useState(false);

  const [showRoleModal, setShowRoleModal] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [roleName, setRoleName] = useState("");
  const [selectedModuleIds, setSelectedModuleIds] = useState<number[]>([]);
  const [expandedModuleKeys, setExpandedModuleKeys] = useState<string[]>([]);

  const [deleteRoleConfirmOpen, setDeleteRoleConfirmOpen] = useState(false);
  const [roleToDelete, setRoleToDelete] = useState<number | null>(null);
  const [isDeletingRole, setIsDeletingRole] = useState(false);
  const [isSavingRole, setIsSavingRole] = useState(false);
  const [adminPage, setAdminPage] = useState(1);
  const adminPageSize = 8;

  const loadData = async () => {
    try {
      setLoading(true);
      const [adminsData, rolesData, modulesData] = await Promise.all([
        getAdmins(),
        getRoles(),
        getModules(),
      ]);
      setAdmins(adminsData);
      setRoles(rolesData);
      setModules(modulesData);
    } catch (error) {
      console.error("Failed to load data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    setAdminPage(1);
  }, [admins.length]);

  const adminTotalPages = Math.max(1, Math.ceil(admins.length / adminPageSize));
  const paginatedAdmins = admins.slice(
    (adminPage - 1) * adminPageSize,
    adminPage * adminPageSize,
  );

  const openAddAdmin = () => {
    setEditingAdmin(null);
    setShowAdminModal(true);
  };

  const openEditAdmin = (admin: Admin) => {
    setEditingAdmin(admin);
    setShowAdminModal(true);
  };

  const closeAdminModal = () => {
    setShowAdminModal(false);
    setEditingAdmin(null);
  };

  const handleAdminSubmit = async (data: AdminSchemaFormValues) => {
    try {
      if (editingAdmin) {
        await updateAdmin(editingAdmin.id, data);
        toast.success("Admin profile updated");
      } else {
        await createAdmin(data);
        toast.success("Admin added successfully");
      }
      await loadData();
      closeAdminModal();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save admin. Please try again.");
    }
  };

  const handleDeleteAdmin = async (id: number) => {
    setAdminToDelete(id);
    setDeleteConfirmOpen(true);
  };

  const confirmDeleteAdmin = async () => {
    if (!adminToDelete || isDeletingAdmin) return;
    setIsDeletingAdmin(true);
    try {
      await deleteAdmin(adminToDelete);
      await loadData();
      setDeleteConfirmOpen(false);
      setAdminToDelete(null);
      toast.success("Admin removed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete admin. Please try again.");
    } finally {
      setIsDeletingAdmin(false);
    }
  };

  const openAddRole = () => {
    setEditingRole(null);
    setRoleName("");
    setSelectedModuleIds([]);
    setExpandedModuleKeys([]);
    setShowRoleModal(true);
  };

  useEffect(() => {
    setHeaderActions(
      <>
        <button
          type="button"
          onClick={openAddRole}
          aria-label="Create Role"
          title="Create Role"
          className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-2 py-2 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50 sm:px-3"
        >
          <Plus className="size-4" />
          <span className="hidden sm:inline">Create Role</span>
        </button>
        <button
          type="button"
          onClick={openAddAdmin}
          aria-label="Add Admin"
          title="Add Admin"
          className="flex items-center gap-1.5 rounded-lg bg-red-500 px-2 py-2 text-xs font-semibold text-white transition-colors hover:bg-red-600 sm:px-3"
        >
          <Plus className="size-4" />
          <span className="hidden sm:inline">Add Admin</span>
        </button>
      </>,
    );

    return () => setHeaderActions(null);
  }, [setHeaderActions]);

  const openEditRole = (role: Role) => {
    setEditingRole(role);
    setRoleName(role.name);
    const assignedIds = new Set(role.modules.map((module) => module.id));
    const assignedKeys = new Set(role.modules.map((module) => module.key));
    setSelectedModuleIds(modules
      .filter((module) => !modules.some((child) => child.parent_key === module.key))
      .filter((module) => assignedIds.has(module.id)
        || (module.parent_key !== null && assignedKeys.has(module.parent_key)))
      .map((module) => module.id));
    setExpandedModuleKeys(
      modules
        .filter((module) => modules.some((child) => child.parent_key === module.key
          && (assignedIds.has(child.id) || assignedKeys.has(module.key))))
        .map((module) => module.key),
    );
    setShowRoleModal(true);
  };

  const closeRoleModal = () => {
    setShowRoleModal(false);
    setEditingRole(null);
  };

  const handleRoleSubmit = async () => {
    const name = roleName.trim();
    if (!name) {
      toast.error("Role name is required");
      return;
    }
    if (name.length > 255) {
      toast.error("Role name must not exceed 255 characters");
      return;
    }
    if (selectedModuleIds.length === 0) {
      toast.error("Please select at least one module");
      return;
    }
    const validModuleIds = new Set(modules.map((module) => module.id));
    if (
      new Set(selectedModuleIds).size !== selectedModuleIds.length ||
      selectedModuleIds.some((id) => !validModuleIds.has(id))
    ) {
      toast.error("The selected module list is invalid");
      return;
    }

    if (isSavingRole) return;
    setIsSavingRole(true);
    try {
      if (editingRole) {
        await updateRole(editingRole.id, {
          name,
          module_ids: selectedModuleIds,
        });
        toast.success("Role updated");
      } else {
        await createRole({
          name,
          module_ids: selectedModuleIds,
        });
        toast.success("Role added");
      }
      await loadData();
      closeRoleModal();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save role. Please try again.");
    } finally {
      setIsSavingRole(false);
    }
  };

  const handleDeleteRole = async (id: number) => {
    setRoleToDelete(id);
    setDeleteRoleConfirmOpen(true);
  };

  const confirmDeleteRole = async () => {
    if (!roleToDelete || isDeletingRole) return;
    setIsDeletingRole(true);
    try {
      await deleteRole(roleToDelete);
      await loadData();
      setDeleteRoleConfirmOpen(false);
      setRoleToDelete(null);
      toast.success("Role removed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete role. Please try again.");
    } finally {
      setIsDeletingRole(false);
    }
  };

  const toggleModule = (moduleId: number) => {
    setSelectedModuleIds((prev) =>
      prev.includes(moduleId)
        ? prev.filter((id) => id !== moduleId)
        : [...prev, moduleId],
    );
  };

  const toggleModuleGroup = (module: Module, children: Module[]) => {
    if (children.length === 0) {
      toggleModule(module.id);
      return;
    }

    setExpandedModuleKeys((previous) => previous.includes(module.key)
      ? previous.filter((key) => key !== module.key)
      : [...previous, module.key]);
  };

  const parentModules = modules
    .filter((module) => module.parent_key === null)
    .sort((left, right) => {
      const moduleOrder = [
        "dashboard",
        "appointment",
        "walkin",
        "history",
        "crm",
        "management",
        "reports",
        "feedback",
      ];

      const leftIndex = moduleOrder.indexOf(left.key);
      const rightIndex = moduleOrder.indexOf(right.key);

      return (leftIndex === -1 ? moduleOrder.length : leftIndex)
        - (rightIndex === -1 ? moduleOrder.length : rightIndex);
    });

  const activeAdminCount = admins.filter((admin) => isActiveValue(admin.is_active)).length;
  const inactiveAdminCount = admins.length - activeAdminCount;

  if (loading) {
    return (
      <div className="w-full h-full font-sans flex items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="w-full p-4 pb-12 font-sans sm:p-6 sm:pb-10">
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        {[
          { label: "Total admins", value: admins.length, icon: Users, iconClassName: "bg-slate-100 text-slate-600" },
          { label: "Active", value: activeAdminCount, icon: UserCheck, iconClassName: "bg-green-50 text-green-600" },
          { label: "Inactive", value: inactiveAdminCount, icon: UserRoundX, iconClassName: "bg-gray-100 text-gray-500" },
          { label: "Roles", value: roles.length, icon: Shield, iconClassName: "bg-red-50 text-red-500" },
        ].map(({ label, value, icon: Icon, iconClassName }) => (
          <div key={label} className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-3 shadow-sm sm:p-4">
            <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", iconClassName)}>
              <Icon className="size-5" />
            </span>
            <div>
              <p className="text-xl font-bold leading-none text-gray-900">{value}</p>
              <p className="mt-1 text-xs font-medium text-gray-500">{label}</p>
            </div>
          </div>
        ))}
      </section>

      <section className="mt-6">
        <div className="mb-3">
          <h2 className="text-lg font-bold text-gray-900">Admins</h2>
          <p className="mt-0.5 text-sm text-gray-500">Admin accounts with their assigned role.</p>
        </div>

        {admins.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white p-10 text-center shadow-sm">
            <AlertTriangle className="mb-3 size-10 text-gray-300" />
            <h3 className="text-base font-semibold text-gray-700">No admins yet</h3>
            <p className="mt-1 text-sm text-gray-400">Add an admin account to manage the barbershop system.</p>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-3 md:hidden">
              {paginatedAdmins.map((admin) => (
                <div key={admin.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900">{admin.fullname}</p>
                      <p className="mt-0.5 truncate text-xs text-gray-500">{admin.email}</p>
                      <p className="mt-1 text-xs text-gray-500">{admin.contact_number}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button onClick={() => openEditAdmin(admin)} className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100" aria-label={`Edit ${admin.fullname}`}>
                        <Pencil className="size-4" />
                      </button>
                      <button onClick={() => handleDeleteAdmin(admin.id)} className="rounded-md p-1.5 text-red-400 hover:bg-red-50" aria-label={`Delete ${admin.fullname}`}>
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <span className="rounded-full border border-gray-200 px-2 py-0.5 text-xs font-medium text-gray-700">{admin.role_name ?? "No role"}</span>
                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", isActiveValue(admin.is_active) ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500")}>
                      {isActiveValue(admin.is_active) ? "Active" : "Inactive"}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="hidden overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm md:block">
              <Table>
                <TableHeader className="bg-gray-50">
                  <TableRow>
                    <TableHead>Admin ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Contact number</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedAdmins.map((admin) => (
                    <TableRow key={admin.id}>
                      <TableCell className="font-mono text-xs font-semibold text-gray-700">ADM-{String(admin.id).padStart(4, "0")}</TableCell>
                      <TableCell className="font-medium text-gray-900">{admin.fullname}</TableCell>
                      <TableCell className="text-gray-600">{admin.email}</TableCell>
                      <TableCell className="text-gray-600">{admin.contact_number}</TableCell>
                      <TableCell>
                        <span className="rounded-full border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-700">{admin.role_name ?? "No role"}</span>
                      </TableCell>
                      <TableCell>
                        <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-medium", isActiveValue(admin.is_active) ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500")}>
                          {isActiveValue(admin.is_active) ? "Active" : "Inactive"}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <button onClick={() => openEditAdmin(admin)} className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100" aria-label={`Edit ${admin.fullname}`}>
                            <Pencil className="size-4" />
                          </button>
                          <button onClick={() => handleDeleteAdmin(admin.id)} className="rounded-md p-1.5 text-red-400 hover:bg-red-50" aria-label={`Delete ${admin.fullname}`}>
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}

        {admins.length > 0 && adminTotalPages > 1 && (
          <Pagination className="mt-4 overflow-hidden px-1">
            <PaginationContent className="flex-nowrap gap-0.5">
              <PaginationItem>
                <PaginationPrevious href="#" className="h-8 w-8 sm:h-9 sm:w-auto" text="" onClick={(event) => { event.preventDefault(); setAdminPage((prev) => Math.max(1, prev - 1)); }} />
              </PaginationItem>
              {(() => {
                const pages: (number | "...")[] = [];
                const total = adminTotalPages;
                const current = adminPage;
                pages.push(1);
                if (current > 3) pages.push("...");
                for (let index = Math.max(2, current - 1); index <= Math.min(total - 1, current + 1); index++) pages.push(index);
                if (current < total - 2) pages.push("...");
                if (total > 1) pages.push(total);
                return pages.map((pageNo, index) => pageNo === "..." ? (
                  <PaginationItem key={`ellipsis-${index}`}><PaginationEllipsis className="size-7 sm:size-8" /></PaginationItem>
                ) : (
                  <PaginationItem key={pageNo}>
                    <PaginationLink href="#" isActive={pageNo === current} className="h-7 w-7 rounded-lg text-xs font-medium sm:h-8 sm:w-8 sm:text-sm" onClick={(event) => { event.preventDefault(); setAdminPage(pageNo); }}>
                      {pageNo}
                    </PaginationLink>
                  </PaginationItem>
                ));
              })()}
              <PaginationItem>
                <PaginationNext href="#" className="h-8 w-8 sm:h-9 sm:w-auto" text="" onClick={(event) => { event.preventDefault(); setAdminPage((prev) => Math.min(adminTotalPages, prev + 1)); }} />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        )}
      </section>

      <section className="mt-8">
        <div className="mb-3">
          <h2 className="text-lg font-bold text-gray-900">Roles</h2>
          <p className="mt-0.5 text-sm text-gray-500">Reusable module permissions assigned to admin accounts.</p>
        </div>

        {roles.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white p-10 text-center shadow-sm">
            <Shield className="mb-3 size-10 text-gray-300" />
            <h3 className="text-base font-semibold text-gray-700">No roles yet</h3>
            <p className="mt-1 text-sm text-gray-400">Create a role to assign module permissions to admin accounts.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {roles.map((role) => {
              const assignedAdminCount = admins.filter((admin) => admin.role_id === role.id).length;

              return (
                <article key={role.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Shield className="size-4 shrink-0 text-red-500" />
                        <h3 className="truncate font-semibold text-gray-900">{role.name}</h3>
                        <span className="shrink-0 rounded-full border border-gray-200 px-2 py-0.5 text-[11px] font-medium text-gray-500">
                          {assignedAdminCount} {assignedAdminCount === 1 ? "admin" : "admins"}
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-gray-500">Reusable access profile.</p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button onClick={() => openEditRole(role)} className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100" aria-label={`Edit ${role.name}`}>
                        <Pencil className="size-4" />
                      </button>
                      <button onClick={() => handleDeleteRole(role.id)} className="rounded-md p-1.5 text-red-400 hover:bg-red-50" aria-label={`Delete ${role.name}`}>
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {role.modules.map((module) => (
                      <span key={module.id} className="inline-flex items-center gap-1 rounded-full border border-red-100 bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700">
                        <Check className="size-3" />
                        {module.name}
                      </span>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <AdminForm
        open={showAdminModal}
        onClose={closeAdminModal}
        onSubmit={handleAdminSubmit}
        roles={roles}
        initialData={
          editingAdmin
            ? {
                fullname: editingAdmin.fullname,
                email: editingAdmin.email,
                contact_number: editingAdmin.contact_number,
                is_active: isActiveValue(editingAdmin.is_active),
                role_id: editingAdmin.role_id ?? undefined,
              }
            : undefined
        }
        title={editingAdmin ? "Edit Admin" : "Add New Admin"}
      />

      <Dialog
        open={deleteConfirmOpen}
        onOpenChange={(open) => {
          if (!isDeletingAdmin) setDeleteConfirmOpen(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              Delete Admin
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this admin? This action cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteConfirmOpen(false)}
              disabled={isDeletingAdmin}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={confirmDeleteAdmin}
              disabled={isDeletingAdmin}
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              {isDeletingAdmin ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showRoleModal}
        onOpenChange={(open) => {
          if (!open && !isSavingRole) closeRoleModal();
        }}
      >
        <DialogContent className="grid max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-gray-900">
              {editingRole ? "Edit Role" : "Create Role"}
            </DialogTitle>
            <DialogDescription className="text-gray-500 text-sm mt-0.5">
              {editingRole
                ? "Update the role name and permissions"
                : "Define a new role with specific module permissions"}
            </DialogDescription>
          </DialogHeader>

          <div className="flex min-h-0 flex-col gap-4 overflow-hidden">
            <div>
              <InputWithLabel
                id="role-name"
                label="Role Name"
                value={roleName}
                onChange={(e) => setRoleName(e.target.value)}
                placeholder="e.g. Front Desk"
                maxLength={255}
                disabled={isSavingRole}
              />
            </div>

            <div className="flex min-h-0 flex-1 flex-col">
              <p className="block text-sm font-medium text-gray-700 mb-2">
                Module Permissions
              </p>
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pr-1">
                <div className="space-y-1.5">
                  {parentModules.map((module) => {
                      const children = modules.filter(
                        (child) => child.parent_key === module.key,
                      );
                      const isExpanded = expandedModuleKeys.includes(module.key);
                      const isSelected = selectedModuleIds.includes(module.id);

                      return (
                        <div
                          key={module.id}
                          className={cn(
                            "rounded-lg border border-gray-200 transition-colors",
                            isSelected && "border-red-200 bg-red-50/40",
                            children.length > 0 && "mt-2",
                          )}
                        >
                          <div className="flex items-center justify-between gap-3 px-3 py-2.5">
                            <CheckboxWithLabel
                              id={`module-${module.id}`}
                              label={module.name}
                              checked={children.length > 0 ? isExpanded : isSelected}
                              disabled={isSavingRole}
                              aria-expanded={children.length > 0 ? isExpanded : undefined}
                              aria-controls={children.length > 0 ? `submodules-${module.id}` : undefined}
                              onCheckedChange={() => toggleModuleGroup(module, children)}
                              containerClassName="flex-1 border-0 p-0"
                              className="border-gray-300 data-checked:border-red-500 data-checked:bg-red-500"
                              labelClassName="flex-1 font-medium text-gray-900"
                            />
                            {children.length > 0 && (
                              <button
                                type="button"
                                aria-label={`${isExpanded ? "Hide" : "Show"} ${module.name} submodules`}
                                aria-expanded={isExpanded}
                                aria-controls={`submodules-${module.id}`}
                                disabled={isSavingRole}
                                onClick={() =>
                                  setExpandedModuleKeys((previous) =>
                                    previous.includes(module.key)
                                      ? previous.filter((key) => key !== module.key)
                                      : [...previous, module.key],
                                  )
                                }
                                className="rounded-md p-1 text-gray-500 hover:bg-gray-100"
                              >
                                <ChevronDown
                                  className={cn("h-5 w-5 transition-transform", isExpanded && "rotate-180")}
                                />
                              </button>
                            )}
                          </div>

                          {isExpanded && children.length > 0 && (
                            <div id={`submodules-${module.id}`} className="mx-3 space-y-1 border-t border-gray-200 py-2">
                              {children.map((child) => (
                                <CheckboxWithLabel
                                  key={child.id}
                                  id={`module-${child.id}`}
                                  label={child.name}
                                  checked={selectedModuleIds.includes(child.id)}
                                  disabled={isSavingRole}
                                  onCheckedChange={() => toggleModule(child.id)}
                                  containerClassName={cn(
                                    "rounded-md px-2 py-1.5 transition-colors hover:bg-gray-50",
                                    selectedModuleIds.includes(child.id) && "border-red-200 bg-red-50/40",
                                  )}
                                  className="border-gray-300 data-checked:border-red-500 data-checked:bg-red-500"
                                  labelClassName="flex-1 text-sm font-medium text-gray-900"
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={closeRoleModal}
              disabled={isSavingRole}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleRoleSubmit}
              disabled={isSavingRole}
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              {isSavingRole
                ? "Saving..."
                : editingRole
                  ? "Update Role"
                  : "Create Role"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteRoleConfirmOpen}
        onOpenChange={(open) => {
          if (!isDeletingRole) setDeleteRoleConfirmOpen(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              Delete Role
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this role? 
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteRoleConfirmOpen(false)}
              disabled={isDeletingRole}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={confirmDeleteRole}
              disabled={isDeletingRole}
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              {isDeletingRole ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
