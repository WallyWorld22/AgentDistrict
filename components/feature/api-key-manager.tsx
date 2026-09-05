"use client";

import * as React from "react";
import { Key } from "lucide-react";
import { Field, Input } from "@/components/ui/input";
import { CodeBlock } from "@/components/ui/code-block";
import { Pill } from "@/components/ui/pill";
import { ActionForm } from "./action-form";
import { createApiKeyAction, type ActionState } from "@/app/actions";

export type ApiKeyRow = {
  id: string;
  label: string;
  prefix: string;
  scopes: string[];
  lastUsed: string;
  created: string;
};

/**
 * API key list + minting (BUILD_SPEC §4 `/developers`).
 *
 * `createApiKey` returns the raw key exactly once; it is rendered here and then
 * gone — only the hash is stored, and nothing can recover it.
 */
export function ApiKeyManager({ keys }: { keys: ApiKeyRow[] }) {
  const [minted, setMinted] = React.useState<string | null>(null);

  const action = React.useCallback(
    async (state: ActionState, form: FormData): Promise<ActionState> => {
      const result = await createApiKeyAction(state, form);
      if (result?.ok && result.message) setMinted(result.message);
      // The raw key is rendered below, not in a toast that disappears.
      return result?.ok ? { ok: true } : result;
    },
    [],
  );

  return (
    <div className="grid gap-3">
      <ul className="m-0 grid list-none gap-2 p-0">
        {keys.map((key) => (
          <li
            key={key.id}
            className="bg-inset-surface rounded-[14px] border border-[#1c2638] p-2.5"
          >
            <div className="flex items-center justify-between gap-2">
              <b className="truncate text-[12px] font-extrabold">{key.label}</b>
              <code className="shrink-0 font-mono text-[10.5px] text-cyan">
                {key.prefix}…
              </code>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {key.scopes.map((scope) => (
                <Pill key={scope} size="sm">
                  {scope}
                </Pill>
              ))}
            </div>
            <small className="mt-1.5 block text-[10px] text-muted">
              created {key.created} · last used {key.lastUsed}
            </small>
          </li>
        ))}
        {keys.length === 0 ? (
          <li className="text-[12px] text-muted">No keys yet.</li>
        ) : null}
      </ul>

      {minted ? (
        <div>
          <p className="m-0 mb-1.5 text-[11px] font-extrabold text-yellow">
            Copy this now — it is never shown again.
          </p>
          <CodeBlock label="New key" code={minted} />
        </div>
      ) : null}

      <ActionForm action={action} submitLabel="Create key" submitVariant="outline" fullWidth>
        <Field label="Label" htmlFor="key-label" required>
          <Input
            id="key-label"
            name="label"
            required
            placeholder="CI, laptop, agent runner…"
            icon={<Key className="size-4" aria-hidden="true" />}
          />
        </Field>
        <Field label="Scopes" htmlFor="key-scopes" hint="Comma separated.">
          <Input
            id="key-scopes"
            name="scopes"
            defaultValue="agents:read, gigs:read, jobs:read, stats:read"
          />
        </Field>
      </ActionForm>
    </div>
  );
}
