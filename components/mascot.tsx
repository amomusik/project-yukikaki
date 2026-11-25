import { cn } from "@/components/ui";

/**
 * Paper-cut mascot: a kid in a red knit hat clearing snow with a shovel.
 * Same palette as the hero illustration. Decorative (aria-hidden) unless a title is given.
 */
export function ShovelKid({ className, title }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 160 136"
      className={cn("yk-mascot", className)}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {/* snow ground, cut in two layers */}
      <path d="M4 124 C 30 108, 62 112, 84 116 S 132 106, 156 118 L 156 136 L 4 136 Z" fill="#a9c8de" />
      <path d="M0 128 C 28 116, 60 120, 86 122 S 134 114, 160 124 L 160 136 L 0 136 Z" fill="#eef4fa" />
      {/* swept path behind the kid */}
      <path d="M8 130 C 30 124, 52 125, 70 126" stroke="#cfe0ee" strokeWidth="5" strokeLinecap="round" fill="none" />

      <g className="yk-mascot__cut">
        {/* boots */}
        <rect x="55" y="111" width="13" height="9" rx="3.5" fill="#7a4a2a" />
        <rect x="71" y="111" width="13" height="9" rx="3.5" fill="#7a4a2a" />
        {/* legs */}
        <rect x="58" y="96" width="9" height="18" rx="2" fill="#1f3550" />
        <rect x="72" y="96" width="9" height="18" rx="2" fill="#1f3550" />
        {/* coat */}
        <path d="M57 64 C 62 60, 78 60, 83 64 L 89 100 C 76 104, 63 104, 51 100 Z" fill="#4f7396" />
        <path d="M70 62 L 70 101" stroke="#3d5e7e" strokeWidth="1.5" />
        {/* scarf */}
        <rect x="58" y="58" width="24" height="7" rx="3.5" fill="#e9a23b" />
        <path d="M76 63 L 80 76 L 74 76 Z" fill="#d48b25" />
        {/* head */}
        <circle cx="70" cy="47" r="13" fill="#f3cfa8" />
        <circle cx="64.5" cy="50" r="1.6" fill="#1f2a36" />
        <circle cx="75.5" cy="50" r="1.6" fill="#1f2a36" />
        <circle cx="61.5" cy="54.5" r="2.4" fill="#ef9f8c" opacity="0.7" />
        <circle cx="78.5" cy="54.5" r="2.4" fill="#ef9f8c" opacity="0.7" />
        <path d="M66.5 55.5 Q 70 58.5 73.5 55.5" stroke="#1f2a36" strokeWidth="1.3" fill="none" strokeLinecap="round" />
        {/* hair */}
        <path d="M57 46 C 57 52, 59 56, 61 58 L 60 46 Z" fill="#5a3a24" />
        <path d="M83 46 C 83 52, 81 56, 79 58 L 80 46 Z" fill="#5a3a24" />
        {/* red knit hat */}
        <path d="M56 45 C 55 30, 85 30, 84 45 Z" fill="#c8372d" />
        <rect x="55" y="40" width="30" height="8" rx="4" fill="#a82a22" />
        <path d="M60 41.5 v5 M65 41.5 v5 M70 41.5 v5 M75 41.5 v5 M80 41.5 v5" stroke="#8f2019" strokeWidth="1.2" />
        <circle cx="70" cy="29" r="5.5" fill="#f6f9fc" />
        {/* shovel: handle, blade, scoop of snow */}
        <path d="M76 70 L 124 110" stroke="#9a6a3a" strokeWidth="4" strokeLinecap="round" />
        <path d="M113 104 L 132 103 L 136 119 L 113 121 Z" fill="#8fa3b5" />
        <path d="M113 104 L 132 103 L 133 108 L 114 109 Z" fill="#a9bccc" />
        <path d="M112 106 C 116 96, 128 95, 134 103 Z" fill="#ffffff" />
        {/* arms */}
        <path d="M62 68 C 66 76, 72 78, 78 75" stroke="#4f7396" strokeWidth="6" strokeLinecap="round" fill="none" />
        <path d="M80 67 C 88 78, 92 86, 96 88" stroke="#4f7396" strokeWidth="6" strokeLinecap="round" fill="none" />
        {/* mittens */}
        <circle cx="80" cy="74" r="4.2" fill="#c8372d" />
        <circle cx="99" cy="89" r="4.2" fill="#c8372d" />
      </g>

      {/* flying snow */}
      <circle cx="140" cy="92" r="3" fill="#ffffff" />
      <circle cx="148" cy="82" r="2" fill="#ffffff" />
      <circle cx="132" cy="84" r="1.6" fill="#ffffff" />
      <circle cx="30" cy="30" r="2" fill="#a9c8de" />
      <circle cx="120" cy="22" r="2.4" fill="#a9c8de" />
      <circle cx="98" cy="40" r="1.6" fill="#a9c8de" />
    </svg>
  );
}
