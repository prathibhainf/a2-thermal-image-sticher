# SolarScope

A local-first starter web app for reviewing drone solar-thermography captures. Add RGB and thermal images to see readable GPS positions, an approximate flight path, filename-based RGB/thermal pairs, and a GPS-placed image preview. Capture pins can be opened at the same coordinates in Google Maps.

## Run locally

1. Install Python 3 if it is not already installed.
2. From this folder, run `python server.py`.
3. Open `http://127.0.0.1:8000` in a modern browser.
4. Select or drop the RGB and thermal image files for an inspection.

The app reads image metadata in the browser. Images are not sent to the local server or saved after the browser session ends. The map uses OpenStreetMap tiles, and the EXIF reader, map library, and fonts load from public CDNs, so an internet connection is required.

## Current capabilities

- Extracts latitude and longitude from supported image EXIF metadata.
- Shows image capture locations, an approximate path ordered by capture time (or filename), and links to Google Maps.
- Classifies image types from filenames containing terms such as `RGB`, `visible`, `TIR`, `thermal`, or `infrared`.
- Matches RGB and thermal files whose names share a base, for example `roof_001_RGB.jpg` and `roof_001_TIR.jpg`.
- Renders a location-based RGB or thermal image preview when GPS is present.
- Accepts common browser-readable images and TIFF files in the upload picker. Displaying TIFF previews depends on browser support.

## Important accuracy note

The array preview is a visual arrangement of image thumbnails using GPS locations. It is **not** an orthomosaic and does not perform photogrammetric stitching, perspective correction, thermal calibration, or roof-plane reconstruction. GPS points alone do not provide image footprint, camera orientation, or altitude. Accurate stitching and thermal-to-RGB registration need calibrated camera/drone metadata and a processing pipeline (for example, a photogrammetry backend); the prototype does not claim these outputs.

## Suggested next steps for a production system

1. Define accepted drone/camera models and sample image formats, including how RGB and thermal pairs are identified.
2. Add a server-side photogrammetry workflow to create a georeferenced RGB orthomosaic and a registered thermal orthomosaic.
3. Publish the resulting georeferenced thermal raster as a map overlay, with inspection tools for panel-level temperatures and anomalies.
4. Add project storage, processing status, and deployment configuration. For Google basemaps, configure an authorized Google Maps Platform API key and follow its tile, attribution, and usage requirements.

## GitHub

Initialize a repository in this folder, review the files, then add a GitHub remote and push using your preferred GitHub workflow. The local HTTP server is for development only and is not a production deployment.
