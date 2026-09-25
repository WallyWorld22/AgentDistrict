"use client";

import * as React from "react";
import { Save } from "lucide-react";
import { AVATAR_GRADIENTS } from "@/lib/data/ext/agents";
import { gradientIdFor } from "@/lib/data/ext/profiles";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { ActionForm } from "@/components/feature/action-form";
import { AvatarPicker } from "@/components/agents/avatar-picker";
import { updateProfileAction } from "@/app/(app)/settings/actions";

export type AccountFormProps = {
  handle: string;
  displayName: string;
  bio: string;
  avatarEmoji: string;
  /** A gradient **id** from `AVATAR_GRADIENTS`. */
  avatarGradientId: string;
};

const BIO_LIMIT = 400;

/**
 * `/settings` → Account.
 *
 * The emoji + gradient picker is `AvatarPicker`, the very component the agent
 * onboarding wizard uses — the preview is therefore the real avatar, not a
 * mock-up of one. It speaks gradient *values* (it paints them), while the
 * column stores gradient *ids* (a user-writable column must not author CSS), so
 * the two hidden inputs carry the id and the emoji and the picker's state is
 * translated on the way in and out.
 *
 * Everything else is a plain form field: this is a Server Action with progressive
 * enhancement, not a controlled form.
 */
export function AccountForm({
  handle,
  displayName,
  bio,
  avatarEmoji,
  avatarGradientId,
}: AccountFormProps) {
  const [name, setName] = React.useState(displayName);
  const [emoji, setEmoji] = React.useState(avatarEmoji);
  const [gradientId, setGradientId] = React.useState(avatarGradientId);
  const [bioText, setBioText] = React.useState(bio);

  const gradient =
    AVATAR_GRADIENTS.find((choice) => choice.id === gradientId)?.value ??
    AVATAR_GRADIENTS[0].value;

  return (
    <ActionForm
      action={updateProfileAction}
      successToast="Profile saved."
      footer={(pending) => (
        <Button type="submit" variant="primary" size="sm" loading={pending} fullWidth>
          <Save className="size-3.5" aria-hidden="true" />
          Save profile
        </Button>
      )}
    >
      <AvatarPicker
        emoji={emoji}
        gradient={gradient}
        handle={handle}
        name={name || displayName}
        onEmojiChange={setEmoji}
        onGradientChange={(value) => setGradientId(gradientIdFor(value) ?? gradientId)}
      />
      <input type="hidden" name="avatarEmoji" value={emoji} />
      <input type="hidden" name="avatarGradient" value={gradientId} />

      <Field
        label="Display name"
        htmlFor="settings-display-name"
        required
        hint="Shown on your posts, your reviews and in the top bar."
      >
        <Input
          id="settings-display-name"
          name="displayName"
          required
          maxLength={60}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </Field>

      <Field
        label="Bio"
        htmlFor="settings-bio"
        hint={`${bioText.length}/${BIO_LIMIT} — one or two lines on what you build or buy.`}
      >
        <Textarea
          id="settings-bio"
          name="bio"
          rows={3}
          maxLength={BIO_LIMIT}
          value={bioText}
          onChange={(event) => setBioText(event.target.value)}
        />
      </Field>
    </ActionForm>
  );
}
