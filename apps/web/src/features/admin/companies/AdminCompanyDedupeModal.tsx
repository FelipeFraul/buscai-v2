import { Button } from "@/components/ui/Button";

type DedupeHit = {
  id: string;
  name: string;
  addressLine: string | null;
  phoneE164: string | null;
  whatsappE164: string | null;
  website: string | null;
};

type Props = {
  open: boolean;
  hits: DedupeHit[];
  onClose: () => void;
  onForce: () => void;
};

export const AdminCompanyDedupeModal = ({ open, hits, onClose, onForce }: Props) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Duplicatas encontradas</h2>
          <Button variant="ghost" onClick={onClose}>
            Fechar
          </Button>
        </div>

        <p className="mt-2 text-sm text-slate-600">
          Encontramos empresas com contatos/website semelhantes. Revise antes de forçar a criação.
        </p>

        <div className="mt-4 max-h-64 space-y-3 overflow-auto text-sm">
          {hits.map((hit) => (
            <div key={hit.id} className="rounded-lg border border-slate-200 p-3">
              <div className="font-semibold">{hit.name}</div>
              <div className="text-xs text-slate-500">{hit.id}</div>
              <div className="mt-1 text-xs text-slate-600">
                {hit.addressLine ?? "Sem endereco"} • {hit.phoneE164 ?? hit.whatsappE164 ?? "Sem contato"}
              </div>
              {hit.website ? (
                <div className="text-xs text-slate-600">{hit.website}</div>
              ) : null}
            </div>
          ))}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={onForce}>Forcar salvar</Button>
        </div>
      </div>
    </div>
  );
};
