import React, { useState } from "react";
import "../styles/profile-photo.css";

interface ProfilePhotoProps {
  className?: string;
  priority?: boolean;
  alt?: string;
}

export default function ProfilePhoto({
  className = "",
  priority = false,
  alt = "Original professional photograph of Pio Languisan",
}: ProfilePhotoProps) {
  const [hasError, setHasError] = useState(false);

  const imagePath =
    `${import.meta.env.BASE_URL}assets/images/profile-original.png`;

  if (hasError) {
    return (
      <div
        role="img"
        aria-label="Missing original profile photograph"
        className="profile-photo-container"
      >
        <div className="w-full max-w-[480px] border border-[#E5CE93]/25 bg-[#0D2B32] px-6 py-10 text-center">
          <p className="text-sm font-semibold text-[#F5F2EB]">
            Original profile photograph not found
          </p>
          <p className="mt-2 font-mono text-xs text-[#E5CE93]">
            Expected asset: public/assets/images/profile-original.png
          </p>
          <p className="mt-2 text-xs leading-relaxed text-[#F5F2EB]/70">
            Please add the original uploaded PNG file to{" "}
            <span className="font-mono">public/assets/images/profile-original.png</span>{" "}
            without altering or re-encoding the image.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="profile-photo-container">
      <img
        src={imagePath}
        alt={alt}
        className={`profile-photo ${className}`.trim()}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        fetchPriority={priority ? "high" : "auto"}
        draggable={false}
        onError={() => setHasError(true)}
      />
    </div>
  );
}
