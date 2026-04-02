const isProd = process.env.NODE_ENV === "production";

/**
 * CSP: Next.js + Toss(결제창 iframe·스크립트·API) + YouTube + Daum/Kakao 우편번호 + Google TTS
 * 토스 호스트: https://docs.tosspayments.com/reference/using-api/security (브랜드페이 방화벽 목록 등)
 */
const tossPaymentUiOrigins = [
  "https://js.tosspayments.com",
  "https://api.tosspayments.com",
  "https://apigw-sandbox.tosspayments.com",
  "https://apigw.tosspayments.com",
  "https://log.tosspayments.com",
  "https://event.tosspayments.com",
  "https://static.toss.im",
  "https://pages.tosspayments.com",
  "https://polyfill-fe.toss.im",
  "https://assets-fe.toss.im",
  /** 결제창·위젯이 추가 서브도메인으로 로드되는 경우(CSP Level 3) */
  "https://*.tosspayments.com",
  "https://*.toss.im",
];

const contentSecurityPolicy = [
  "default-src 'self'",
  [
    "script-src",
    "'self'",
    "'unsafe-inline'",
    "'unsafe-eval'",
    "https://www.youtube.com",
    "https://www.gstatic.com",
    "https://t1.daumcdn.net",
    "https://vercel.live",
    ...tossPaymentUiOrigins,
  ].join(" "),
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "media-src 'self' blob: data:",
  isProd
    ? [
        "connect-src",
        "'self'",
        ...tossPaymentUiOrigins,
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
    "https://vercel.live",
    "https://postcode.map.daum.net",
    "https://suggest-bar.daum.net",
    "https://spi.maps.daum.net",
    "https://ssl.daumcdn.net",
    "https://t1.daumcdn.net",
    "https://postcode.map.kakao.com",
    "http://postcode.map.kakao.com",
    ...tossPaymentUiOrigins,
  ].join(" "),
  /** 결제 SDK·위젯이 blob worker 를 쓰는 경우 */
  "worker-src 'self' blob: data:",
  "base-uri 'self'",
  [
    "form-action",
    "'self'",
    "https://api.tosspayments.com",
    "https://apigw-sandbox.tosspayments.com",
    "https://apigw.tosspayments.com",
    "https://pages.tosspayments.com",
  ].join(" "),
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
            // YouTube iframe/위젯에서 일부 기능(compute-pressure)을 사용할 수 있어,
            // 기본 deny로 인해 콘솔에 반복 경고가 뜨지 않도록 완화합니다.
            value: "camera=(), microphone=(), geolocation=(), compute-pressure=*",
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
