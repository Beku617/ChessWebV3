import { CSSProperties, useEffect, useMemo, useState } from "react";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Play,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { FeaturedEvent } from "../../hooks/useWatchPage";
import i18n from "../../i18n";
import "./watchFeaturedCarousel.css";

const API_URL = import.meta.env.VITE_API_URL;

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

function buildFallbackSlides(t: (key: string) => string): Slide[] {
  return [
    {
      id: "fallback-0",
      variant: "slide-0",
      piece: "K",
      statusLabel: t("watchPage.fallback.live"),
      eventType: t("watchPage.fallback.tournament"),
      title: t("watchPage.fallback.worldChampionshipTitle"),
      description: t("watchPage.fallback.worldChampionshipDescription"),
      date: "Mar 8, 2026",
      primaryButtonLabel: t("Watch Now"),
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
      statusLabel: t("watchPage.fallback.live"),
      eventType: "GRAND PRIX",
      title: t("watchPage.fallback.grandPrixTitle"),
      description: t("watchPage.fallback.grandPrixDescription"),
      date: "Apr 2, 2026",
      primaryButtonLabel: t("Watch Now"),
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
      statusLabel: t("watchPage.fallback.live"),
      eventType: t("watchPage.fallback.speedChess"),
      title: t("watchPage.fallback.speedChessTitle"),
      description: t("watchPage.fallback.speedChessDescription"),
      date: "Apr 17, 2026",
      primaryButtonLabel: t("Watch Now"),
      primaryButtonUrl: "",
      secondaryButtonLabel: "Chess.com",
      secondaryButtonUrl: "",
      backgroundType: "default",
      backgroundColor: "",
      backgroundImageUrl: "",
    },
  ];
}

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
  const normalized = source.toLowerCase();
  if (normalized === "tournament") return i18n.t("Tournament").toUpperCase();
  if (normalized === "match") return i18n.t("Match").toUpperCase();
  if (normalized === "broadcast") return i18n.t("Broadcast").toUpperCase();
  if (normalized === "event") return i18n.t("Event").toUpperCase();
  if (!source) return i18n.t("watchPage.fallback.event");
  return source.replace(/[_-]+/g, " ").toUpperCase();
}

function formatStatusLabel(value?: string | null): string {
  const source = String(value || "").trim();
  const normalized = source.toLowerCase();
  if (normalized === "live") return i18n.t("live").toUpperCase();
  if (normalized === "upcoming") return i18n.t("UPCOMING").toUpperCase();
  if (normalized === "completed") return i18n.t("Completed").toUpperCase();
  if (!source) return i18n.t("watchPage.fallback.live");
  return source.replace(/[_-]+/g, " ").toUpperCase();
}

function formatDateLabel(value?: string | null): string {
  const source = String(value || "").trim();
  if (!source) return "";
  const date = new Date(source);
  if (Number.isNaN(date.getTime())) return source;
  const locale = i18n.resolvedLanguage || i18n.language || undefined;
  return date.toLocaleDateString(locale, {
    localeMatcher: "best fit",
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
  const statusLabel = String(event.statusLabel || "").trim();
  const categoryLabel = String(event.categoryLabel || "").trim();
  const secondaryButtonLabel = String(event.secondaryButtonLabel || "").trim();
  const primaryButtonLabel = String(event.primaryButtonLabel || "").trim();

  return {
    id: String(event._id || `event-${index}`),
    variant,
    piece: ["K", "Q", "R"][index % 3],
    statusLabel: statusLabel || formatStatusLabel(event.status),
    eventType: categoryLabel || formatTypeLabel(event.type),
    title: String(event.title || "").trim(),
    description: String(event.description || "").trim(),
    date: formatDateLabel(event.startDate),
    primaryButtonLabel,
    primaryButtonUrl:
      String(event.primaryButtonUrl || "").trim() || String(event.lichessUrl || "").trim(),
    secondaryButtonLabel: secondaryButtonLabel || extractDomainLabel(resolvedSecondaryUrl) || "",
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
  const { t } = useTranslation();
  const slides = useMemo(() => {
    const source = Array.isArray(events) ? events : [];
    if (!source.length) return buildFallbackSlides(t);
    const prioritized = source.filter((event) => event.featured);
    const visibleEvents = prioritized.length ? prioritized : source;
    return visibleEvents.map((event, index) => {
      const slide = eventToSlide(event, index);
      return {
        ...slide,
        title: slide.title || t("watchPage.fallback.featuredEvent"),
        primaryButtonLabel: slide.primaryButtonLabel || t("Watch Now"),
        secondaryButtonLabel: slide.secondaryButtonLabel || t("watchPage.fallback.details"),
      };
    });
  }, [events, t]);

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
        <div className="watch-featured-label">{t("watchPage.featuredTournaments")}</div>
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
          aria-label={t("watchPage.previousFeaturedSlide")}
        >
          <ChevronLeft size={16} />
        </button>
        <button
          type="button"
          className="watch-featured-arr next"
          onClick={() => goTo(currentSlide + 1)}
          aria-label={t("watchPage.nextFeaturedSlide")}
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
              aria-label={t("watchPage.goToFeaturedSlide", {
                index: index + 1,
              })}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
