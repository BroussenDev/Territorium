import { svg } from "lit";

/** Two crossed swords, drawn for the rivalry banner and the profile. */
export const crossedSwords = (
  sizeClass: string,
) => svg`<svg viewBox="0 0 64 64" class="${sizeClass}" fill="none" aria-hidden="true">
  <g stroke-linejoin="round" stroke-linecap="round">
    <g>
      <path d="M12 10 L16 8 L48 40 L44 44 Z" fill="#e5e7eb" stroke="#0f172a" stroke-width="2"/>
      <path d="M14 11 L46 41" stroke="#94a3b8" stroke-width="1.4"/>
      <path d="M40 38 L50 48 L47 51 L37 41 Z" fill="#f59e0b" stroke="#0f172a" stroke-width="2"/>
      <path d="M48 46 L56 54 L53 57 L45 49 Z" fill="#7c2d12" stroke="#0f172a" stroke-width="2"/>
      <circle cx="56" cy="57" r="2.6" fill="#f59e0b" stroke="#0f172a" stroke-width="1.6"/>
    </g>
    <g>
      <path d="M52 10 L48 8 L16 40 L20 44 Z" fill="#f1f5f9" stroke="#0f172a" stroke-width="2"/>
      <path d="M50 11 L18 41" stroke="#94a3b8" stroke-width="1.4"/>
      <path d="M24 38 L14 48 L17 51 L27 41 Z" fill="#f59e0b" stroke="#0f172a" stroke-width="2"/>
      <path d="M16 46 L8 54 L11 57 L19 49 Z" fill="#7c2d12" stroke="#0f172a" stroke-width="2"/>
      <circle cx="8" cy="57" r="2.6" fill="#f59e0b" stroke="#0f172a" stroke-width="1.6"/>
    </g>
  </g>
</svg>`;
