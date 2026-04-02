const isProd = process.env.NODE_ENV === "production";

/** CSP: Next.js + Toss + YouTube iframe + Daum 우편번호 + Google TTS */
const contentSecurityPolicy = [
  "default-src 'self'",
  [
    "script-src",
    "'self'",
    "'unsafe-inline'",
    "'unsafe-eval'",
    "https://www.youtube.com",
    "https://www.gstatic.com",
    "https://js.tosspayments.com",
    "https://t1.daumcdn.net",
  ].join(" "),
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  isProd
    ? [
        "connect-src",
        "'self'",
        "https://api.tosspayments.com",
        "https://log.tosspayments.com",
        "https://texttospeech.googleapis.com",
        "https://*.googleapis.com",
        "https://*.tts.speech.microsoft.com",
        "https://postcode.map.daum.net",
        "https://suggest-bar.daum.net",
        "https://spi.maps.daum.net",
        "https://ssl.daumcdn.net",
        "https://t1.daumcdn.net",
        "https://postcode.map.kakao.com",
        "http://postcode.map.kakao.com",
      ].join(" ")
    : "connect-src 'self' https: http: ws: wss:",
  [
    "frame-src",
    "'self'",
    "https://www.youtube.com",
    "https://www.youtube-nocookie.com",
    "https://postcode.map.daum.net",
    "https://suggest-bar.daum.net",
    "https://spi.maps.daum.net",
    "https://ssl.daumcdn.net",
    "https://t1.daumcdn.net",
    "https://postcode.map.kakao.com",
    "http://postcode.map.kakao.com",
  ].join(" "),
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isProd ? ["upgrade-insecure-requests"] : []),
].join("; ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
          ...(isProd
            ? [
                {
                  key: "Strict-Transport-Security",
                  value: "max-age=63072000; includeSubDomains; preload",
                },
              ]
            : []),
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
        ],
      },
    ];
  },
};

export default nextConfig;
