import React from "react";

const HERO_IMAGE = "https://media.base44.com/images/public/6a29ff3bc8effbeb3d637555/curated-lifestyle-H3ZVdxBRIW0-unsplash.jpg";

export default function AuthLayout({ icon: Icon, title, subtitle, footer, children }) {
  return (
    <div className="relative min-h-screen flex items-center justify-center px-4">
      <img src={HERO_IMAGE} alt="" className="absolute inset-0 w-full h-full object-cover object-center" />
      <div className="absolute inset-0" style={{ backgroundColor: "rgba(15, 40, 80, 0.35)" }} />
      <div className="relative z-10 w-full max-w-md">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary mb-4">
            <Icon className="w-7 h-7 text-primary-foreground" aria-hidden="true" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">{title}</h1>
          {subtitle && <p className="text-gray-500 mt-2">{subtitle}</p>}
        </div>
        <div className="bg-white/90 backdrop-blur-md rounded-2xl shadow-2xl border border-gray-200/60 p-8">
          {children}
        </div>
        {footer && (
          <p className="text-center text-sm text-gray-500 mt-6">{footer}</p>
        )}
      </div>
    </div>
  );
}