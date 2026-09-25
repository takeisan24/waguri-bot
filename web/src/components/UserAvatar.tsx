"use client";

import React, { useState } from "react";

interface UserAvatarProps {
  src?: string | null;
  alt?: string;
  size?: number;
  className?: string;
}

export default function UserAvatar({
  src,
  alt = "User Avatar",
  size,
  className = "rounded-full object-cover",
}: UserAvatarProps) {
  const [hasError, setHasError] = useState(false);
  const effectiveSrc = !src || hasError ? "/user-avatar.svg" : src;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      key={src || "fallback"}
      src={effectiveSrc}
      alt={alt}
      width={size}
      height={size}
      onError={() => setHasError(true)}
      className={className}
      loading="lazy"
    />
  );
}
