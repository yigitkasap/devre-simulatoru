import { tr } from '../i18n/tr';

/** Simülatörün kök bileşeni. Aşama 2'de şematik editör buraya gelecek. */
export default function Simulator() {
  return (
    <main className="flex h-full items-center justify-center p-8 text-center">
      <div>
        <h1 className="text-2xl font-semibold">{tr.site.name}</h1>
        <p className="mt-2 text-muted">{tr.app.loading}</p>
      </div>
    </main>
  );
}
