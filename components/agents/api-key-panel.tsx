"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Key, ShieldCheck, Trash2 } from "lucide-react";
import { API_KEY_SCOPE_GROUPS, DEFAULT_KEY_SCOPES, type ApiKeyView } from "@/lib/data/ext/agents";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { CodeBlock } from "@/components/ui/code-block";
import { Field, Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Pill } from "@/components/ui/pill";
import { useToast } from "@/components/ui/toast";
import { Inset } from "@/components/feature/panel";
import { createProfileApiKey, revokeProfileApiKey } from "@/app/(app)/profile/actions";

/**
 * API keys on `/profile#api-keys` (BUILD_SPEC §2 "returns raw key once").
 *
 * The mint call is a direct Server Action rather than an `<ActionForm>`: the
 * raw key comes back exactly once and has to land somewhere the owner can copy
 * from deliberately — a non-dismissible modal — not in a toast that fades.
 */
export function ApiKeyPanel({
  keys,
  canRevoke,
}: {
  keys: ApiKeyView[];
  /** The live adapter implements `revokeApiKey`. */
  canRevoke: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [label, setLabel] = React.useState("");
  const [scopes, setScopes] = React.useState<string[]>(DEFAULT_KEY_SCOPES);
  const [minted, setMinted] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const [busyId, setBusyId] = React.useState<string | null>(null);

  function toggleScope(scope: string) {
    setScopes((current) =>
      current.includes(scope)
        ? current.filter((value) => value !== scope)
        : [...current, scope],
    );
  }

  function create() {
    setError(null);
    startTransition(async () => {
      const result = await createProfileApiKey({ label: label.trim(), scopes });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setMinted(result.key);
      setLabel("");
      router.refresh();
    });
  }

  function revoke(id: string, keyLabel: string) {
    setBusyId(id);
    startTransition(async () => {
      const result = await revokeProfileApiKey(id);
      setBusyId(null);
      toast({
        title: result.ok ? `Revoked “${keyLabel}”.` : result.message,
        tone: result.ok ? "success" : "error",
      });
      if (result.ok) router.refresh();
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <ul className="m-0 grid list-none content-start gap-2 p-0" data-testid="api-key-list">
        {keys.map((key) => (
          <li
            key={key.id}
            className="bg-inset-surface rounded-[16px] border border-[#1c2638] p-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <b className="flex min-w-0 items-center gap-2 text-[12.5px] font-extrabold">
                <Key className="size-3.5 shrink-0 text-muted" aria-hidden="true" />
                <span className="truncate">{key.label}</span>
              </b>
              <div className="flex items-center gap-2">
                <code className="font-mono text-[10.5px] text-cyan">{key.prefix}…</code>
                {canRevoke ? (
                  <Button
                    type="button"
                    variant="danger"
                    size="xs"
                    loading={busyId === key.id}
                    onClick={() => revoke(key.id, key.label)}
                    aria-label={`Revoke ${key.label}`}
                  >
                    <Trash2 className="size-3" aria-hidden="true" />
                    Revoke
                  </Button>
                ) : null}
              </div>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {key.scopes.map((scope) => (
                <Pill key={scope} size="sm" variant={scope.endsWith(":write") ? "yellow" : "default"}>
                  {scope}
                </Pill>
              ))}
            </div>
            <small className="mt-1.5 block text-[10.5px] text-muted">
              created {key.created} · last used {key.lastUsed}
            </small>
          </li>
        ))}
        {keys.length === 0 ? (
          <li className="text-[12px] text-muted">
            No keys yet — mint one to call the District from code.
          </li>
        ) : null}
      </ul>

      <div className="grid content-start gap-3">
        <Field label="Label" htmlFor="key-label" required hint="Where this key lives.">
          <Input
            id="key-label"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="CI, laptop, agent runner…"
            icon={<Key className="size-4" aria-hidden="true" />}
          />
        </Field>

        <fieldset className="m-0 grid gap-1.5 border-0 p-0">
          <legend className="mb-1 text-[10px] font-extrabold tracking-[0.08em] text-[#8c9ab2] uppercase">
            Scopes
          </legend>
          <div className="grid gap-1">
            {API_KEY_SCOPE_GROUPS.map((group) => (
              <div key={group.resource} className="grid gap-1">
                {group.scopes.map((scope) => (
                  <label
                    key={scope}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-[11px] border px-2.5 py-1.5 transition-colors",
                      scopes.includes(scope)
                        ? "border-[#2b4a7d] bg-[#0f2036]"
                        : "border-[#1c2638] bg-[#0b111d] hover:border-[#33415f]",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={scopes.includes(scope)}
                      onChange={() => toggleScope(scope)}
                      className="size-3.5 shrink-0 accent-[#4b8dff]"
                    />
                    <code className="font-mono text-[11px] font-bold text-ink">{scope}</code>
                    {scope.endsWith(":write") ? (
                      <Pill size="sm" variant="yellow" className="ml-auto">
                        write
                      </Pill>
                    ) : null}
                  </label>
                ))}
              </div>
            ))}
          </div>
          <p className="m-0 mt-1 text-[10.5px] leading-relaxed text-muted">
            A <code className="font-mono">:write</code> scope implies its{" "}
            <code className="font-mono">:read</code>. Write keys spend real wallet
            credits and are limited by the Workplace Gateway.
          </p>
        </fieldset>

        {error ? (
          <p
            role="alert"
            className="m-0 flex items-start gap-2 rounded-[13px] border border-[#8a3142] bg-[#2c1017] px-3 py-2 text-[12px] font-semibold text-[#ffb3bd]"
          >
            <AlertTriangle className="mt-px size-4 shrink-0" aria-hidden="true" />
            {error}
          </p>
        ) : null}

        <Button
          type="button"
          variant="primary"
          size="md"
          fullWidth
          loading={pending && busyId === null}
          onClick={create}
          data-testid="create-api-key"
        >
          Create key
        </Button>
      </div>

      <Modal
        open={minted !== null}
        onClose={() => setMinted(null)}
        title="Copy this key now"
        description="It is hashed the moment it is stored — this is the only time it will ever be shown."
        size="sm"
        dismissible={false}
        footer={
          <Button
            type="button"
            variant="primary"
            size="md"
            fullWidth
            onClick={() => setMinted(null)}
          >
            I have stored it
          </Button>
        }
      >
        <div className="grid gap-3" data-testid="minted-key">
          <CodeBlock label="New API key" code={minted ?? ""} />
          <Inset className="flex items-start gap-2">
            <ShieldCheck className="mt-px size-4 shrink-0 text-green" aria-hidden="true" />
            <p className="m-0 text-[11.5px] leading-relaxed text-ink">
              Send it as{" "}
              <code className="font-mono text-cyan">Authorization: Bearer …</code> on any{" "}
              <code className="font-mono text-cyan">/api/v1</code> request. Anyone holding
              it acts as you, within its scopes.
            </p>
          </Inset>
        </div>
      </Modal>
    </div>
  );
}
