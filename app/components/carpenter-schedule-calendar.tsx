"use client";

import { useMemo, useState } from "react";
import type { CarpenterCalendarDay } from "@/lib/carpenter-calendar-types";

type Props = {
  days: CarpenterCalendarDay[];
  onDaysChange: (days: CarpenterCalendarDay[]) => void;
};

function dateKey(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function CarpenterScheduleCalendar(props: Props) {
  const [cursor, setCursor] = useState(() => {
    const n = new Date();
    return { y: n.getFullYear(), m: n.getMonth() };
  });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const todayKey = useMemo(() => {
    const n = new Date();
    return dateKey(n.getFullYear(), n.getMonth(), n.getDate());
  }, []);

  const grid = useMemo(() => {
    const { y, m } = cursor;
    const first = new Date(y, m, 1);
    const pad = first.getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const cells: { key: string | null; dayNum: number | null }[] = [];
    for (let i = 0; i < pad; i++) cells.push({ key: null, dayNum: null });
    for (let d = 1; d <= daysInMonth; d++) cells.push({ key: dateKey(y, m, d), dayNum: d });
    while (cells.length % 7 !== 0) cells.push({ key: null, dayNum: null });
    return cells;
  }, [cursor]);

  function lookup(date: string) {
    return props.days.find((d) => d.date === date);
  }

  function setDayAvailable(dateStr: string) {
    const existing = lookup(dateStr);
    if (!existing) {
      props.onDaysChange([
        ...props.days,
        { date: dateStr, status: "available", startTime: "08:00", endTime: "17:00" },
      ]);
      return;
    }
    props.onDaysChange(
      props.days.map((d) =>
        d.date === dateStr
          ? {
              ...d,
              status: "available" as const,
              startTime: d.startTime || "08:00",
              endTime: d.endTime || "17:00",
            }
          : d,
      ),
    );
  }

  function setDayUnavailable(dateStr: string) {
    const existing = lookup(dateStr);
    if (!existing) {
      props.onDaysChange([
        ...props.days,
        { date: dateStr, status: "unavailable", startTime: "08:00", endTime: "17:00" },
      ]);
      return;
    }
    props.onDaysChange(
      props.days.map((d) => (d.date === dateStr ? { ...d, status: "unavailable" as const } : d)),
    );
  }

  function clearDay(dateStr: string) {
    props.onDaysChange(props.days.filter((d) => d.date !== dateStr));
  }

  function updateTimes(dateStr: string, startTime: string, endTime: string) {
    props.onDaysChange(
      props.days.map((d) => (d.date === dateStr ? { ...d, startTime, endTime } : d)),
    );
  }

  const focusedRecord = selectedDate ? lookup(selectedDate) ?? null : null;

  const monthTitle = new Date(cursor.y, cursor.m, 1).toLocaleString(undefined, {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="rounded-2xl border border-[#dcc6fb] bg-[#fdfbff] p-4 sm:p-5">
      <h3 className="text-base font-semibold text-[#230f35]">Update schedule</h3>
      <p className="mt-1 text-sm leading-relaxed text-[#4d2e70]">
        Tap a date to select it, then use{" "}
        <span className="font-medium text-[#31184a]">Available</span> or{" "}
        <span className="font-medium text-[#31184a]">Unavailable</span>. Set start and end times for days
        you&apos;re open. Use <span className="font-medium text-[#31184a]">Clear</span> to remove an override.
      </p>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() =>
            setCursor((c) => {
              const nm = c.m - 1;
              if (nm < 0) return { y: c.y - 1, m: 11 };
              return { y: c.y, m: nm };
            })
          }
          className="rounded-full border border-[#6e3eb2] px-3 py-1.5 text-sm font-semibold text-[#5b3292] hover:bg-[#f5efff]"
        >
          ← Prev
        </button>
        <p className="text-sm font-semibold text-[#31184a]">{monthTitle}</p>
        <button
          type="button"
          onClick={() =>
            setCursor((c) => {
              const nm = c.m + 1;
              if (nm > 11) return { y: c.y + 1, m: 0 };
              return { y: c.y, m: nm };
            })
          }
          className="rounded-full border border-[#6e3eb2] px-3 py-1.5 text-sm font-semibold text-[#5b3292] hover:bg-[#f5efff]"
        >
          Next →
        </button>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase tracking-wide text-[#7a4bb8] sm:text-xs">
        {WEEKDAYS.map((w) => (
          <div key={w} className="py-1">
            {w}
          </div>
        ))}
      </div>

      <div className="mt-1 grid grid-cols-7 gap-1">
        {grid.map((cell, idx) => {
          if (!cell.key || cell.dayNum == null) {
            return <div key={`pad-${idx}`} className="aspect-square rounded-lg bg-transparent" />;
          }
          const rec = lookup(cell.key);
          const isToday = cell.key === todayKey;
          let tile =
            "aspect-square rounded-lg border text-xs font-medium transition sm:text-sm flex flex-col items-center justify-center gap-0.5 ";
          if (!rec) {
            tile += "border-[#e8d9ff] bg-white/70 text-[#6a4a8f] hover:bg-[#f5efff]";
          } else if (rec.status === "available") {
            tile +=
              "border-emerald-400/80 bg-emerald-50 text-emerald-950 hover:bg-emerald-100/90";
          } else {
            tile += "border-rose-300/90 bg-rose-50 text-rose-950 hover:bg-rose-100/90";
          }
          if (isToday) tile += " ring-2 ring-[#6e3eb2] ring-offset-1";

          const isSelected = selectedDate === cell.key;
          return (
            <button
              key={cell.key}
              type="button"
              onClick={() => setSelectedDate(cell.key)}
              className={
                tile +
                (isSelected ? " outline outline-2 outline-offset-1 outline-[#5b3292]" : "")
              }
              title={
                !rec
                  ? "Not set — select, then mark available or unavailable"
                  : rec.status === "available"
                    ? `Available ${rec.startTime}–${rec.endTime}`
                    : "Unavailable"
              }
            >
              <span>{cell.dayNum}</span>
              {rec?.status === "available" ? (
                <span className="hidden text-[10px] font-normal leading-tight text-emerald-900/90 sm:block">
                  {rec.startTime}-{rec.endTime}
                </span>
              ) : rec?.status === "unavailable" ? (
                <span className="text-[10px] font-semibold uppercase text-rose-800">Off</span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap gap-4 text-xs text-[#55337b]">
        <span className="flex items-center gap-2">
          <span className="h-3 w-3 rounded border border-[#e8d9ff] bg-white" /> Not set
        </span>
        <span className="flex items-center gap-2">
          <span className="h-3 w-3 rounded border border-emerald-400/80 bg-emerald-50" /> Available
        </span>
        <span className="flex items-center gap-2">
          <span className="h-3 w-3 rounded border border-rose-300/90 bg-rose-50" /> Unavailable
        </span>
      </div>

      {selectedDate ? (
        <div className="mt-4 rounded-xl border border-[#dcc6fb] bg-white/90 p-4">
          <p className="text-sm font-semibold text-[#230f35]">
            {new Date(selectedDate + "T12:00:00").toLocaleDateString(undefined, {
              weekday: "long",
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </p>
          <p className="mt-1 text-xs text-[#6a4a8f]">
            Status:{" "}
            {!focusedRecord ? (
              <span className="font-medium text-[#55337b]">Not set</span>
            ) : focusedRecord.status === "available" ? (
              <span className="font-medium text-emerald-800">Available</span>
            ) : (
              <span className="font-medium text-rose-800">Unavailable</span>
            )}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setDayAvailable(selectedDate)}
              className="rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 sm:text-sm"
            >
              Available
            </button>
            <button
              type="button"
              onClick={() => setDayUnavailable(selectedDate)}
              className="rounded-full bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700 sm:text-sm"
            >
              Unavailable
            </button>
            <button
              type="button"
              onClick={() => clearDay(selectedDate)}
              className="rounded-full border border-[#6e3eb2] px-4 py-2 text-xs font-semibold text-[#5b3292] hover:bg-[#f5efff] sm:text-sm"
            >
              Clear
            </button>
          </div>
          {focusedRecord?.status === "available" ? (
            <div className="mt-4 border-t border-emerald-100 pt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-900">Working hours</p>
              <div className="mt-2 flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1 text-xs font-medium text-[#31184a]">
                  Start
                  <input
                    type="time"
                    value={focusedRecord.startTime}
                    onChange={(e) =>
                      updateTimes(focusedRecord.date, e.target.value, focusedRecord.endTime)
                    }
                    className="rounded-lg border border-emerald-200 bg-white px-2 py-1.5 text-sm text-[#230f35]"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs font-medium text-[#31184a]">
                  End
                  <input
                    type="time"
                    value={focusedRecord.endTime}
                    onChange={(e) =>
                      updateTimes(focusedRecord.date, focusedRecord.startTime, e.target.value)
                    }
                    className="rounded-lg border border-emerald-200 bg-white px-2 py-1.5 text-sm text-[#230f35]"
                  />
                </label>
              </div>
            </div>
          ) : null}
          <p className="mt-3 text-xs text-[#6a4a8f]">
            Choose <span className="font-semibold text-[#55337b]">Save availability</span> below to store your
            calendar and notes.
          </p>
        </div>
      ) : (
        <p className="mt-4 text-xs text-[#6a4a8f]">Select a date on the calendar to update it.</p>
      )}
    </div>
  );
}
