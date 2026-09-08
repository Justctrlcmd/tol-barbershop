"use client";

import {
  AlertTriangle,
  ImagePlus,
  Images,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { GalleryImageForm } from "@/forms/GalleryImageForm";
import { useManagementModuleHeaderActions } from "@/layout/manager/ManagementModulePage";
import { getCloudinaryImageUrl, isCloudinaryImageUrl } from "@/lib/cloudinary";
import {
  galleryCategories,
  galleryCategoryLabels,
  type GalleryCategory,
} from "@/lib/gallery";
import { sanitizeString } from "@/lib/sanitizer";
import { cn } from "@/lib/utils";
import {
  createGalleryImage,
  deleteGalleryImage,
  getGalleryImages,
  updateGalleryImage,
  type GalleryImage,
} from "@/services/manager/gallery.api";

import type { GalleryImageFormValues } from "@/validations/gallery-image.validation";

type CategoryFilter = "all" | GalleryCategory;

export function Gallery() {
  const { setHeaderActions } = useManagementModuleHeaderActions();
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] =
    useState<CategoryFilter>("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editingImage, setEditingImage] = useState<GalleryImage | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [imageToDelete, setImageToDelete] = useState<GalleryImage | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadImages = async () => {
    try {
      setLoading(true);
      setImages(await getGalleryImages());
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not load gallery images",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadImages();
  }, []);

  const filteredImages =
    activeCategory === "all"
      ? images
      : images.filter((image) => image.category === activeCategory);

  const openCreateForm = () => {
    setEditingImage(null);
    setFormOpen(true);
  };

  useEffect(() => {
    setHeaderActions(
      <button
        type="button"
        onClick={openCreateForm}
        className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-red-500 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-red-600"
      >
        <Plus className="size-4" />
        Add Image
      </button>,
    );

    return () => setHeaderActions(null);
  }, [setHeaderActions]);

  const openEditForm = (image: GalleryImage) => {
    setEditingImage(image);
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditingImage(null);
  };

  const saveImage = async (data: GalleryImageFormValues) => {
    if (editingImage) {
      await updateGalleryImage(editingImage.id, data);
      toast.success("Gallery image updated successfully");
    } else {
      await createGalleryImage(data);
      toast.success("Gallery image uploaded successfully");
    }

    await loadImages();
    closeForm();
  };

  const requestDelete = (image: GalleryImage) => {
    setImageToDelete(image);
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!imageToDelete) return;

    try {
      setDeleting(true);
      await deleteGalleryImage(imageToDelete.id);
      await loadImages();
      setDeleteConfirmOpen(false);
      setImageToDelete(null);
      toast.success("Gallery image removed");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not delete gallery image",
      );
    } finally {
      setDeleting(false);
    }
  };

  const filters: Array<{ value: CategoryFilter; label: string }> = [
    { value: "all", label: "All" },
    ...galleryCategories.map((category) => ({
      value: category,
      label: galleryCategoryLabels[category],
    })),
  ];

  return (
    <div className="w-full p-4 pb-12 font-sans sm:p-6 sm:pb-10">
      <div className="mb-5 grid grid-cols-4 gap-1 sm:flex sm:flex-wrap sm:gap-2">
        {filters.map((filter) => {
          const count =
            filter.value === "all"
              ? images.length
              : images.filter((image) => image.category === filter.value)
                  .length;

          return (
            <button
              key={filter.value}
              type="button"
              onClick={() => setActiveCategory(filter.value)}
              className={cn(
                "min-w-0 w-full rounded-full border px-1 py-2 text-[10px] font-semibold transition-colors sm:w-auto sm:px-4 sm:text-sm",
                activeCategory === filter.value
                  ? "border-gray-900 bg-gray-900 text-white"
                  : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50",
              )}
            >
              {filter.label} ({count})
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((item) => (
            <Skeleton key={item} className="aspect-[4/3] rounded-xl" />
          ))}
        </div>
      ) : filteredImages.length === 0 ? (
        <div className="flex min-h-64 flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center">
          <Images className="mb-3 h-10 w-10 text-gray-400" />
          <h3 className="font-semibold text-gray-900">No Gallery Images</h3>
          <p className="mt-1 max-w-md text-sm text-gray-500">
            Upload an image to begin managing this landing-page category.
          </p>
          <Button
            type="button"
            onClick={openCreateForm}
            variant="outline"
            className="mt-4"
          >
            <ImagePlus className="h-4 w-4" />
            Upload Image
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredImages.map((image) => {
            const safeAltText = sanitizeString(image.alt_text);

            return (
              <article
                key={image.id}
                className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm"
              >
                <div className="relative aspect-[4/3] bg-gray-100">
                  <Image
                    src={getCloudinaryImageUrl(image.image_url, 900)}
                    alt={safeAltText}
                    fill
                    unoptimized={isCloudinaryImageUrl(image.image_url)}
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    className="object-cover"
                  />
                </div>
                <div className="space-y-4 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span className="inline-flex rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-600">
                        {galleryCategoryLabels[image.category]}
                      </span>
                      <p className="mt-2 line-clamp-2 text-sm text-gray-600">
                        {safeAltText}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs font-medium text-gray-400">
                      Order {image.display_order}
                    </span>
                  </div>
                  <div className="flex gap-2 border-t border-gray-100 pt-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => openEditForm(image)}
                      className="flex-1"
                    >
                      <Pencil className="h-4 w-4" />
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={() => requestDelete(image)}
                      aria-label={`Delete ${safeAltText}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <GalleryImageForm
        open={formOpen}
        initialData={editingImage}
        onClose={closeForm}
        onSubmit={saveImage}
      />

      <Dialog
        open={deleteConfirmOpen}
        onOpenChange={(open) => {
          if (deleting) return;
          setDeleteConfirmOpen(open);
          if (!open) setImageToDelete(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              Delete Gallery Image
            </DialogTitle>
            <DialogDescription>
              This removes the image from the landing page and Cloudinary. This
              action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteConfirmOpen(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleting}
            >
              {deleting ? "Deleting..." : "Delete Image"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
