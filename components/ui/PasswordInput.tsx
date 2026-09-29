"use client";

import { useState, type ComponentProps } from "react";
import { fieldInput } from "./ui";

/**
 * Password field with a show/hide toggle (hidden by default). Only the input's type changes — the value,
 * name and autocomplete stay the same. Accepts every <input> prop, including react-hook-form's register().
 */
export function PasswordInput({ className = "", ...props }: Omit<ComponentProps<"input">, "type">) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      {/*
        Shown as type="text", browsers would spellcheck (possibly via an online service), autocorrect and
        auto-capitalise the password — off in both modes. Edge's own reveal button is hidden so there is only one.
      */}
      <input
        {...props}
        type={visible ? "text" : "password"}
        spellCheck={false}
        autoCapitalize="none"
        autoCorrect="off"
        className={`${fieldInput} pr-10 [&::-ms-reveal]:hidden ${className}`}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-controls={props.id}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-neutral-500 hover:text-neutral-900 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-neutral-900"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="size-[18px]">
          <path d="M2.06 12.35a1 1 0 0 1 0-.7C3.42 8.1 7.36 5 12 5s8.58 3.1 9.94 6.65a1 1 0 0 1 0 .7C20.58 15.9 16.64 19 12 19s-8.58-3.1-9.94-6.65" />
          <circle cx="12" cy="12" r="3" />
          {visible && <path d="m3 3 18 18" />}
        </svg>
      </button>
    </div>
  );
}
