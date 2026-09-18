"use client";

import { useState } from "react";

type CourtMultiSelectorProps = {
  courts: Array<{ id: number; name: string }>;
  inputName: string;
  idPrefix: string;
  description: string;
  emptySelectionMessage: string;
  defaultSelectedCourtIds?: number[];
  tone?: "court" | "sky";
};

const toneClasses = {
  court: {
    button:
      "border-court-800/30 text-court-800 hover:bg-court-800/5",
    selected: "border-court-700 bg-court-800/5 text-court-950",
    available:
      "border-court-800/15 bg-white text-ink-900 hover:border-court-700/50",
    checkbox: "accent-court-800",
    summary: "text-court-800",
  },
  sky: {
    button: "border-sky-300 text-sky-800 hover:bg-sky-50",
    selected: "border-sky-600 bg-sky-50 text-sky-950",
    available:
      "border-court-800/15 bg-white text-ink-900 hover:border-sky-300",
    checkbox: "accent-sky-700",
    summary: "text-sky-800",
  },
} as const;

export function CourtMultiSelector({
  courts,
  inputName,
  idPrefix,
  description,
  emptySelectionMessage,
  defaultSelectedCourtIds,
  tone = "court",
}: CourtMultiSelectorProps) {
  const [selectedCourtIds, setSelectedCourtIds] = useState<number[]>(() => {
    const initialIds =
      defaultSelectedCourtIds ?? (courts[0] ? [courts[0].id] : []);
    const availableIds = new Set(courts.map((court) => court.id));

    return Array.from(
      new Set(initialIds.filter((courtId) => availableIds.has(courtId))),
    ).sort((first, second) => first - second);
  });
  const allSelected =
    courts.length > 0 && selectedCourtIds.length === courts.length;
  const classes = toneClasses[tone];

  function toggleCourt(courtId: number) {
    setSelectedCourtIds((current) =>
      current.includes(courtId)
        ? current.filter((id) => id !== courtId)
        : [...current, courtId].sort((first, second) => first - second),
    );
  }

  function toggleAllCourts() {
    setSelectedCourtIds(allSelected ? [] : courts.map((court) => court.id));
  }

  const selectionLabel = allSelected
    ? `All ${courts.length} courts selected`
    : `${selectedCourtIds.length} ${selectedCourtIds.length === 1 ? "court" : "courts"} selected`;

  return (
    <fieldset className="md:col-span-2 xl:col-span-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <legend className="text-sm font-bold text-ink-900">Courts</legend>
          <p className="mt-1 text-xs text-ink-500">{description}</p>
        </div>
        <button
          type="button"
          onClick={toggleAllCourts}
          aria-pressed={allSelected}
          className={`inline-flex min-h-10 items-center justify-center rounded-lg border px-3 text-xs font-bold transition ${classes.button}`}
        >
          {allSelected ? "Clear all courts" : "Select all courts"}
        </button>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {courts.map((court) => {
          const selected = selectedCourtIds.includes(court.id);

          return (
            <label
              key={court.id}
              htmlFor={`${idPrefix}-${court.id}`}
              className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm font-bold transition ${
                selected ? classes.selected : classes.available
              }`}
            >
              <input
                id={`${idPrefix}-${court.id}`}
                type="checkbox"
                name={inputName}
                value={court.id}
                checked={selected}
                onChange={() => toggleCourt(court.id)}
                className={`size-4 ${classes.checkbox}`}
              />
              {court.name}
            </label>
          );
        })}
      </div>

      <p
        className={`mt-2 text-xs font-semibold ${
          selectedCourtIds.length > 0 ? classes.summary : "text-red-700"
        }`}
        aria-live="polite"
      >
        {selectedCourtIds.length > 0
          ? selectionLabel
          : emptySelectionMessage}
      </p>
    </fieldset>
  );
}
