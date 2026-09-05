"use client";

import { AVATAR_EMOJI, AVATAR_GRADIENTS } from "@/lib/data/ext/agents";
import { cn } from "@/lib/utils";
import { AgentAvatar } from "@/components/ui/avatar";

/**
 * Emoji + gradient picker for step 1 of onboarding, with the live preview the
 * directory will actually render (`AgentAvatar` is the same component the
 * Passport card uses, so what you pick is what you get).
 */
export function AvatarPicker({
  emoji,
  gradient,
  handle,
  name,
  status,
  onEmojiChange,
  onGradientChange,
}: {
  emoji: string;
  gradient: string;
  handle: string;
  name: string;
  status?: "available" | "offline";
  onEmojiChange: (emoji: string) => void;
  onGradientChange: (gradient: string) => void;
}) {
  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-3">
        <AgentAvatar
          emoji={emoji}
          handle={handle || "new-agent"}
          gradient={gradient}
          name={name || "Your agent"}
          size="lg"
          status={status}
        />
        <div className="min-w-0">
          <b className="block truncate text-[14px] font-extrabold">
            {name || "Your agent"}
          </b>
          <small className="block truncate text-[11px] text-muted">
            @{handle || "handle"}
          </small>
        </div>
      </div>

      <fieldset className="m-0 grid gap-1.5 border-0 p-0">
        <legend className="mb-1 text-[10px] font-extrabold tracking-[0.08em] text-[#8c9ab2] uppercase">
          Avatar emoji
        </legend>
        <div
          className="flex flex-wrap gap-1.5"
          role="radiogroup"
          aria-label="Avatar emoji"
        >
          {AVATAR_EMOJI.map((choice) => (
            <button
              key={choice}
              type="button"
              role="radio"
              aria-checked={choice === emoji}
              aria-label={`Emoji ${choice}`}
              onClick={() => onEmojiChange(choice)}
              className={cn(
                "grid size-9 place-items-center rounded-[11px] border text-[17px] transition-colors",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue",
                choice === emoji
                  ? "border-blue bg-[#12244a]"
                  : "border-line bg-[#0b111d] hover:border-[#33415f]",
              )}
            >
              <span aria-hidden="true">{choice}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="m-0 grid gap-1.5 border-0 p-0">
        <legend className="mb-1 text-[10px] font-extrabold tracking-[0.08em] text-[#8c9ab2] uppercase">
          Gradient
        </legend>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Avatar gradient">
          {AVATAR_GRADIENTS.map((choice) => (
            <button
              key={choice.id}
              type="button"
              role="radio"
              aria-checked={choice.value === gradient}
              aria-label={choice.label}
              onClick={() => onGradientChange(choice.value)}
              className={cn(
                "size-9 rounded-[11px] border-2 transition-transform",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue",
                choice.value === gradient
                  ? "scale-105 border-white/80"
                  : "border-transparent hover:scale-105",
              )}
              style={{ backgroundImage: choice.value }}
            />
          ))}
        </div>
      </fieldset>
    </div>
  );
}
