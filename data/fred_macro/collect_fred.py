import requests
import pandas as pd

API_KEY = "15255b121db11f6db88ba7f8fb1d2329"

SERIES = {
    "FEDFUNDS": "Fed Funds Rate",
    "CPIAUCSL": "CPI",
    "UNRATE": "Unemployment Rate",
    "GDP": "GDP",
}

BASE_URL = "https://api.stlouisfed.org/fred/series/observations"


def fetch_series(series_id: str, series_name: str) -> pd.DataFrame:
    params = {
        "series_id": series_id,
        "api_key": API_KEY,
        "file_type": "json",
    }

    response = requests.get(BASE_URL, params=params, timeout=30)
    response.raise_for_status()
    data = response.json()["observations"]

    rows = []
    for obs in data:
        rows.append(
            {
                "series_id": series_id,
                "series_name": series_name,
                "date": obs["date"],
                "value": obs["value"],
            }
        )

    return pd.DataFrame(rows)


def main() -> None:
    frames = []

    for series_id, series_name in SERIES.items():
        df = fetch_series(series_id, series_name)
        frames.append(df)

    result = pd.concat(frames, ignore_index=True)
    result.to_csv("data/fred_macro/fred_macro_sample.csv", index=False)
    print("Saved data/fred_macro/fred_macro_sample.csv")


if __name__ == "__main__":
    main()