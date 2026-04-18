import { CSSProperties, useEffect, useMemo, useState } from "react";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Play,
} from "lucide-react";
import type { FeaturedEvent } from "../../hooks/useWatchPage";
import "./watchFeaturedCarousel.css";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

const HERO_VARIANTS = ["slide-0", "slide-1", "slide-2"] as const;

type HeroVariant = (typeof HERO_VARIANTS)[number];

type Slide = {
  id: string;
  variant: HeroVariant;
  piece: string;
  statusLabel: string;
  eventType: string;
  title: string;
  description: string;
  date: string;
  primaryButtonLabel: string;
  primaryButtonUrl: string;
  secondaryButtonLabel: string;
  secondaryButtonUrl: string;
  backgroundType: "default" | "color" | "image";
  backgroundColor: string;
  backgroundImageUrl: string;
};

const FALLBACK_SLIDES: Slide[] = [
  {
    id: "fallback-0",
    variant: "slide-0",
    piece: "K",
    statusLabel: "LIVE",
    eventType: "TOURNAMENT",
    title: "World Chess Championships",
    description:
      "Candidates tournament will happen and the challenger will fight with World Champion Gukesh, the most anticipated chess event of the year.",
    date: "Mar 8, 2026",
    primaryButtonLabel: "Watch Now",
    primaryButtonUrl: "",
    secondaryButtonLabel: "Lichess",
    secondaryButtonUrl: "",
    backgroundType: "default",
    backgroundColor: "",
    backgroundImageUrl: "",
  },
  {
    id: "fallback-1",
    variant: "slide-1",
    piece: "Q",
    statusLabel: "LIVE",
    eventType: "GRAND PRIX",
    title: "FIDE Grand Prix Series",
    description:
      "Top 16 elite players battle across four legs for qualification spots with sharp opening preparation and classical precision.",
    date: "Apr 2, 2026",
    primaryButtonLabel: "Watch Now",
    primaryButtonUrl: "",
    secondaryButtonLabel: "Chess.com",
    secondaryButtonUrl: "",
    backgroundType: "default",
    backgroundColor: "",
    backgroundImageUrl: "",
  },
  {
    id: "fallback-2",
    variant: "slide-2",
    piece: "R",
    statusLabel: "LIVE",
    eventType: "SPEED CHESS",
    title: "Speed Chess Championship",
    description:
      "The fastest chess on the planet: bullet, blitz, and rapid in one bracket with constant tactical swings.",
    date: "Apr 17, 2026",
    primaryButtonLabel: "Watch Now",
    primaryButtonUrl: "",
    secondaryButtonLabel: "Chess.com",
    secondaryButtonUrl: "",
    backgroundType: "default",
    backgroundColor: "",
    backgroundImageUrl: "",
  },
];

function normalizePotentialUploadPath(value = ""): string {
  const raw = String(value || "").trim().replace(/\\/g, "/");
  if (!raw) return "";
  const marker = "/uploads/";
  const index = raw.toLowerCase().indexOf(marker);
  if (index < 0) return raw;
  return raw.slice(index);
}

function resolveAssetUrl(url?: string | null): string {
  const value = normalizePotentialUploadPath(url || "");
  if (!value) return "";
  if (
    value.startsWith("http://") ||
    value.startsWith("https://") ||
    value.startsWith("data:") ||
    value.startsWith("blob:")
  ) {
    return value;
  }
  return `${API_URL}${value.startsWith("/") ? "" : "/"}${value}`;
}

function formatTypeLabel(value?: string | null): string {
  const source = String(value || "").trim();
  if (!source) return "EVENT";
  return source.replace(/[_-]+/g, " ").toUpperCase();
}

function formatStatusLabel(value?: string | null): string {
  const source = String(value || "").trim();
  if (!source) return "LIVE";
  return source.replace(/[_-]+/g, " ").toUpperCase();
}

function formatDateLabel(value?: string | null): string {
  const source = String(value || "").trim();
  if (!source) return "";
  const date = new Date(source);
  if (Number.isNaN(date.getTime())) return source;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function extractDomainLabel(rawUrl = ""): string {
  const url = String(rawUrl || "").trim();
  if (!url) return "";
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./i, "");
  } catch {
    return "";
  }
}

function eventToSlide(event: FeaturedEvent, index: number): Slide {
  const variant = HERO_VARIANTS[index % HERO_VARIANTS.length];
  const backgroundImageUrl = resolveAssetUrl(
    event.backgroundImageUrl || event.imageUrl || "",
  );
  const backgroundType =
    event.backgroundType || (backgroundImageUrl ? "image" : "default");
  const fallbackSecondaryUrl = String(event.lichessUrl || "").trim();
  const secondaryButtonUrl = String(event.secondaryButtonUrl || "").trim();
  const resolvedSecondaryUrl = secondaryButtonUrl || fallbackSecondaryUrl;

  return {
    id: String(event._id || `event-${index}`),
    variant,
    piece: ["K", "Q", "R"][index % 3],
    statusLabel: formatStatusLabel(event.status),
    eventType: formatTypeLabel(event.type),
    title: String(event.title || "Featured Event").trim() || "Featured Event",
    description: String(event.description || "").trim(),
    date: formatDateLabel(event.startDate),
    primaryButtonLabel:
      String(event.primaryButtonLabel || "").trim() || "Watch Now",
    primaryButtonUrl:
      String(event.primaryButtonUrl || "").trim() || String(event.lichessUrl || "").trim(),
    secondaryButtonLabel:
      extractDomainLabel(resolvedSecondaryUrl) ||
      "Details",
    secondaryButtonUrl: resolvedSecondaryUrl,
    backgroundType,
    backgroundColor: String(event.backgroundColor || "").trim(),
    backgroundImageUrl,
  };
}

function ChessTexture() {
  return (
    <div className="watch-featured-tex" aria-hidden="true">
      {Array.from({ length: 40 }).map((_, index) => {
        const row = Math.floor(index / 8);
        const col = index % 8;
        const isAlt = (row + col) % 2 === 0;
        return (
          <div key={index} className={`watch-featured-sq${isAlt ? " alt" : ""}`} />
        );
      })}
    </div>
  );
}

type WatchFeaturedCarouselProps = {
  events?: FeaturedEvent[];
  loading?: boolean;
};

export function WatchFeaturedCarousel({ events, loading }: WatchFeaturedCarouselProps) {
  const slides = useMemo(() => {
    const source = Array.isArray(events) ? events : [];
    if (!source.length) return FALLBACK_SLIDES;
    const prioritized = source.filter((event) => event.featured);
    const visibleEvents = prioritized.length ? prioritized : source;
    return visibleEvents.map((event, index) => eventToSlide(event, index));
  }, [events]);

  const [currentSlide, setCurrentSlide] = useState(0);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    setCurrentSlide((previous) => {
      if (slides.length <= 0) return 0;
      return previous >= slides.length ? 0 : previous;
    });
  }, [slides.length]);

  useEffect(() => {
    if (isHovered || slides.length <= 1) return;

    const timer = window.setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % slides.length);
    }, 5000);

    return () => window.clearInterval(timer);
  }, [isHovered, slides.length]);

  const goTo = (index: number) => {
    const next = (index + slides.length) % slides.length;
    setCurrentSlide(next);
  };

  return (
    <section className="watch-featured mb-10">
      <div className="watch-featured-row">
        <div className="watch-featured-label">Featured Tournaments</div>
      </div>

      <div
        className="watch-featured-carousel"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div
          className="watch-featured-track"
          style={{ transform: `translateX(-${currentSlide * 100}%)` }}
        >
          {slides.map((slide) => {
            const hasBackgroundImage =
              slide.backgroundType === "image" && Boolean(slide.backgroundImageUrl);
            const slideStyle: CSSProperties = {};

            if (hasBackgroundImage) {
              slideStyle.backgroundImage = `linear-gradient(120deg, rgba(4, 8, 18, 0.28) 0%, rgba(4, 8, 18, 0.68) 100%), url("${slide.backgroundImageUrl}")`;
              slideStyle.backgroundSize = "cover";
              slideStyle.backgroundPosition = "center";
            } else if (
              slide.backgroundType === "color" &&
              slide.backgroundColor
            ) {
              slideStyle.background = slide.backgroundColor;
            }

            return (
              <article
                key={slide.id}
                className={`watch-featured-slide ${slide.variant}`}
                style={slideStyle}
              >
                {!hasBackgroundImage && <ChessTexture />}
                {!hasBackgroundImage && <div className="watch-featured-glow" />}
                {!hasBackgroundImage && (
                  <div className="watch-featured-piece">{slide.piece}</div>
                )}

                <div className="watch-featured-inner">
                  <div className="watch-featured-badge-row">
                    <span className="watch-featured-live">{slide.statusLabel}</span>
                    <span className="watch-featured-type">{slide.eventType}</span>
                  </div>

                  <h3 className="watch-featured-title">{slide.title}</h3>
                  <p className="watch-featured-desc">{slide.description}</p>

                  {slide.date && (
                    <div className="watch-featured-meta">
                      <span>
                        <Calendar size={12} />
                        {slide.date}
                      </span>
                    </div>
                  )}

                  <div className="watch-featured-actions">
                    {slide.primaryButtonUrl ? (
                      <a
                        href={slide.primaryButtonUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="watch-featured-watch"
                      >
                        <Play size={13} />
                        {slide.primaryButtonLabel}
                      </a>
                    ) : (
                      <button
                        type="button"
                        className="watch-featured-watch"
                      >
                        <Play size={13} />
                        {slide.primaryButtonLabel}
                      </button>
                    )}
                    {slide.secondaryButtonUrl && (
                      <a
                        href={slide.secondaryButtonUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="watch-featured-ext"
                      >
                        <ExternalLink size={11} />
                        {slide.secondaryButtonLabel}
                      </a>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        <button
          type="button"
          className="watch-featured-arr prev"
          onClick={() => goTo(currentSlide - 1)}
          aria-label="Previous featured slide"
        >
          <ChevronLeft size={16} />
        </button>
        <button
          type="button"
          className="watch-featured-arr next"
          onClick={() => goTo(currentSlide + 1)}
          aria-label="Next featured slide"
        >
          <ChevronRight size={16} />
        </button>

        <div className="watch-featured-dots">
          {slides.map((slide, index) => (
            <button
              key={slide.id}
              type="button"
              className={`dot${index === currentSlide ? " active" : ""}`}
              onClick={() => goTo(index)}
              aria-label={`Go to featured slide ${index + 1}`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
