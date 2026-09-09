"use client";

import Image from "next/image";
import { Clock3, MapPin, Navigation, Scissors } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { FadeIn } from "@/components/common/FadeIn";
import { SectionHeading } from "@/components/landing/SectionHeading";
import { getCloudinaryImageUrl, isCloudinaryImageUrl } from "@/lib/cloudinary";
import {
  DEFAULT_OPENING_HOURS,
  getOpeningHoursRows,
} from "@/lib/opening-hours";
import { getPublicOpeningHours } from "@/services/public-booking.api";

const VISIT_IMAGE_URL =
  getCloudinaryImageUrl(
    "https://res.cloudinary.com/lgyelfkv/image/upload/Outdoor_vbhkhp",
    1280,
  );
const VISIT_IMAGE_FALLBACK = "/Outdoor.jpeg";

export function VisitSection() {
  const [visitImageSrc, setVisitImageSrc] = useState(VISIT_IMAGE_URL);
  const [openingHours, setOpeningHours] = useState(DEFAULT_OPENING_HOURS);
  const openingHoursRows = useMemo(
    () => getOpeningHoursRows(openingHours),
    [openingHours],
  );

  useEffect(() => {
    let isCurrent = true;

    void getPublicOpeningHours()
      .then((settings) => {
        if (isCurrent) setOpeningHours(settings);
      })
      .catch(() => undefined);

    return () => {
      isCurrent = false;
    };
  }, []);

  return (
    <section className="relative overflow-hidden border-t border-white/5 bg-primary px-4 py-16 sm:px-8 sm:py-20 lg:px-12 lg:py-24">
      <div className="pointer-events-none absolute -left-32 top-1/3 h-72 w-72 rounded-full bg-accent/10 blur-3xl" />
      <div className="pointer-events-none absolute -right-32 bottom-0 h-80 w-80 rounded-full bg-white/5 blur-3xl" />

      <div className="relative mx-auto max-w-7xl">
        <FadeIn>
          <SectionHeading
            eyebrow="Find your way"
            title="Come and Visit Us"
            description="Drop by for a fresh cut or just to say hello. Our chair is ready when you are."
          />
        </FadeIn>

        <FadeIn delay={150}>
          <div className="grid overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] shadow-2xl shadow-black/20 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="group relative min-h-80 overflow-hidden sm:min-h-96 lg:min-h-[38rem]">
            <Image
              src={visitImageSrc}
              alt="TOL Barbershop storefront sign"
              fill
              className="object-cover object-center transition-transform duration-700 group-hover:scale-[1.03]"
              sizes="(max-width: 1024px) 100vw, 42vw"
              unoptimized={isCloudinaryImageUrl(visitImageSrc)}
              onError={() => {
                if (visitImageSrc !== VISIT_IMAGE_FALLBACK) {
                  setVisitImageSrc(VISIT_IMAGE_FALLBACK);
                }
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-primary via-primary/10 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-5 sm:p-7">
              <div className="inline-flex items-center gap-3 rounded-xl border border-white/15 bg-primary/85 px-4 py-3 text-white shadow-lg backdrop-blur-md">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent">
                  <Scissors className="h-5 w-5" aria-hidden="true" />
                </span>
                <span>
                  <span className="block text-sm font-semibold">
                    TOL Barbershop
                  </span>
                  <span className="block text-xs text-white/60">
                    Tejero, General Trias
                  </span>
                </span>
              </div>
            </div>
          </div>

          <div className="flex min-w-0 flex-col">
            <iframe
              title="TOL Barbershop location on Google Maps"
              src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3864.537221528138!2d120.8606439750669!3d14.396166386066287!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x33962da0b18f65cf%3A0xc3b88fcbdf399c9!2sTol%20Barbershop!5e0!3m2!1sen!2sph!4v1783435390818!5m2!1sen!2sph"
              className="h-72 w-full sm:h-80 lg:h-[22rem]"
              style={{ border: 0 }}
              allowFullScreen
              loading="lazy"
              referrerPolicy="strict-origin-when-cross-origin"
            />

            <div className="grid flex-1 gap-6 p-5 sm:grid-cols-2 sm:p-7 lg:p-8">
              <div className="flex gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
                  <MapPin className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <h3 className="font-semibold text-white">Our location</h3>
                  <p className="mt-2 text-sm leading-6 text-white/60">
                    2nd Floor, Osrem Building, Gen. Trias Drive, Tejero,
                    General Trias City, Cavite
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
                  <Clock3 className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <h3 className="font-semibold text-white">Opening hours</h3>
                  <div className="mt-2 space-y-1 text-sm leading-6 text-white/60">
                    {openingHoursRows.map((row) => (
                      <p key={`${row.days}-${row.hours}`}>
                        {row.days}: {row.hours}
                      </p>
                    ))}
                  </div>
                </div>
              </div>

              <a
                href="https://www.google.com/maps/search/?api=1&query=TOL+Barbershop+General+Trias+Cavite"
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90 sm:col-span-2 sm:justify-self-start"
              >
                <Navigation className="h-4 w-4" aria-hidden="true" />
                Get Directions
              </a>
            </div>
          </div>
        </div>
        </FadeIn>
      </div>
    </section>
  );
}
