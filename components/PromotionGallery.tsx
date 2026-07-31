"use client";

import { useEffect, useState } from "react";

type PromotionImage = {
  id: string;
  image_url: string;
  alt_text?: string | null;
};

type Props = {
  title: string;
  images: PromotionImage[];
};

export default function PromotionGallery({ title, images }: Props) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const validImages = images.filter((image) => Boolean(image.image_url));
  const selectedImage = validImages[selectedIndex];

  useEffect(() => {
    if (!lightboxOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setLightboxOpen(false);

      if (event.key === "ArrowRight") {
        setSelectedIndex((current) =>
          validImages.length ? (current + 1) % validImages.length : 0
        );
      }

      if (event.key === "ArrowLeft") {
        setSelectedIndex((current) =>
          validImages.length
            ? (current - 1 + validImages.length) % validImages.length
            : 0
        );
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [lightboxOpen, validImages.length]);

  if (!selectedImage) return null;

  function previousImage() {
    setSelectedIndex((current) =>
      (current - 1 + validImages.length) % validImages.length
    );
  }

  function nextImage() {
    setSelectedIndex((current) => (current + 1) % validImages.length);
  }

  return (
    <>
      <div className="bg-slate-100">
        <button
          type="button"
          className="block w-full cursor-zoom-in"
          onClick={() => setLightboxOpen(true)}
          aria-label="Ampliar imagem da promoção"
        >
          <img
            src={selectedImage.image_url}
            alt={selectedImage.alt_text || title}
            className="max-h-[680px] w-full object-contain"
          />
        </button>

        {validImages.length > 1 && (
          <div className="grid grid-cols-3 gap-2 border-t bg-white p-2 sm:grid-cols-4">
            {validImages.map((image, index) => (
              <button
                key={image.id}
                type="button"
                onClick={() => setSelectedIndex(index)}
                className={`overflow-hidden rounded-lg border-2 bg-slate-100 transition ${
                  selectedIndex === index
                    ? "border-green-600 ring-2 ring-green-100"
                    : "border-transparent hover:border-slate-300"
                }`}
                aria-label={`Visualizar imagem ${index + 1}`}
              >
                <img
                  src={image.image_url}
                  alt={image.alt_text || `${title} — imagem ${index + 1}`}
                  className="h-24 w-full object-cover sm:h-28"
                />
              </button>
            ))}
          </div>
        )}

        {validImages.length > 1 && (
          <p className="border-t bg-white px-4 py-2 text-center text-xs text-slate-500">
            Toque em uma miniatura para trocar a imagem. Toque na imagem grande
            para ampliar.
          </p>
        )}
      </div>

      {lightboxOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-3 sm:p-8"
          role="dialog"
          aria-modal="true"
          aria-label="Visualização ampliada da promoção"
          onClick={() => setLightboxOpen(false)}
        >
          <button
            type="button"
            onClick={() => setLightboxOpen(false)}
            className="absolute right-4 top-4 rounded-full bg-white/15 px-4 py-2 text-2xl font-bold text-white hover:bg-white/25"
            aria-label="Fechar imagem"
          >
            ×
          </button>

          {validImages.length > 1 && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                previousImage();
              }}
              className="absolute left-3 rounded-full bg-white/15 px-4 py-3 text-3xl text-white hover:bg-white/25 sm:left-6"
              aria-label="Imagem anterior"
            >
              ‹
            </button>
          )}

          <img
            src={selectedImage.image_url}
            alt={selectedImage.alt_text || title}
            className="max-h-full max-w-full object-contain"
            onClick={(event) => event.stopPropagation()}
          />

          {validImages.length > 1 && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                nextImage();
              }}
              className="absolute right-3 rounded-full bg-white/15 px-4 py-3 text-3xl text-white hover:bg-white/25 sm:right-6"
              aria-label="Próxima imagem"
            >
              ›
            </button>
          )}

          <div className="absolute bottom-4 rounded-full bg-black/50 px-3 py-1 text-sm text-white">
            {selectedIndex + 1} / {validImages.length}
          </div>
        </div>
      )}
    </>
  );
}
