import axios from "axios";

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL;

if (!apiBaseUrl) {
  throw new Error(
    "NEXT_PUBLIC_API_BASE_URL is not configured.",
  );
}

export const apiClient = axios.create({
  baseURL: apiBaseUrl,
  timeout: 30_000,
  headers: {
    "Content-Type": "application/json",
  },
});

apiClient.interceptors.request.use(
  (config) => {
    if (typeof window !== "undefined") {
      const storedState = localStorage.getItem(
        "banglaguard-auth",
      );

      if (storedState) {
        try {
          const parsedState = JSON.parse(
            storedState,
          );

          const accessToken =
            parsedState?.state?.accessToken;

          if (accessToken) {
            config.headers.Authorization =
              `Bearer ${accessToken}`;
          }
        } catch {
          localStorage.removeItem(
            "banglaguard-auth",
          );
        }
      }
    }

    return config;
  },
  (error) => Promise.reject(error),
);

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (
      typeof window !== "undefined" &&
      error.response?.status === 401
    ) {
      localStorage.removeItem(
        "banglaguard-auth",
      );

      if (
        !window.location.pathname.startsWith(
          "/auth/login",
        )
      ) {
        window.location.href = "/auth/login";
      }
    }

    return Promise.reject(error);
  },
);
