"use client";

import { useEffect, useState } from "react";

export function localDateString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function useCurrentDate() {
  const [currentDate, setCurrentDate] = useState("");

  useEffect(() => {
    // The clock is an external value and is read only after hydration to keep prerender output stable.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCurrentDate(localDateString(new Date()));
  }, []);

  return currentDate;
}
