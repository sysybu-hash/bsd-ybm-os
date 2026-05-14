"use client";

import { useEffect } from "react";

export default function Themer() {
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);
  return null;
}
