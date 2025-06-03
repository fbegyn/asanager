# asanager

A web interface for creating silences in Alertmanager based on label values from
Prometheus. It makes the silence creation a bit easier by being aware of the
prometheus setup.

Then actual management of active silence can be done in the alertmanager web UI
and is out of scope for this application.

## Features

- Query Prometheus for values of labels
- Dropdown selectors with fuzzy search for each label
- Create Alertmanager silences based on selected label values
- Configurable URLs for Prometheus and Alertmanager
- Silence duration options (2h, 4h, 8h, 1d, 2d, 3d, 1w)
- Real-time preview of matchers that will be applied to the silence
- Built-in proxy server
- Single binary with embedded static assets

## Installation

### Option 1: Build from source

1. Make sure you have Go installed (version 1.16 or higher)
1. Clone this repository
1. Build the application:
   ```
   > make build
   ```
1. Run the application:
   ```
   > ./asanager
   ```

### Option 2: Using Docker

1. Pull the Docker image:
   ```bash
   > docker build
   ```
1. Run the container:
   ```bash
   > docker run -p 9193:9193 asanager:latest
   ```
1. Access the application at `http://localhost:9193`

## Usage

1. Configure teh Prometheus and Alertmanager URLs for the application. Either by
   setting the environment variables or passing them as a flag.
1. Open the web page in your browser.
1. Select values for the labels you want to silence.
1. Set the silence duration and provide a comment and your name.
1. Click "Create Silence" to create the silence in Alertmanager.

## Configuration

The following settings can be configured:

- **Prometheus URL**: The URL of your Prometheus instance (default:
  `http://prometheus.foo.bar`)
- **Alertmanager URL**: The URL of your Alertmanager instance (default:
  `http://alertmanager.foo.bar`)
- **Label selectors**: Which labels can be used to create silences against the
  alertmanager (default: `job,instance`)

These settings can be configured in three ways:

### Environment Variables

The application can be configured using environment variables:

- `PORT`: The port to run the server on (default: 3000)
- `PROMETHEUS_URL`: The URL of your Prometheus instance (default: http://prometheus.vdab.be)
- `ALERTMANAGER_URL`: The URL of your Alertmanager instance (default: http://alertmanager.vdab.be)

Example:

```bash
> PORT=8080 PROMETHEUS_URL=http://prometheus.example.com ALERTMANAGER_URL=http://alertmanager.example.com ./asanager
```

### Command-line Flags

The application can be configured using command line flags:

```bash
> ./asanager --help
  -alertmanager-url string
     Alertmanager URL (default "http://alertmanager.foo.bar")
  -label-selector string
        Comma-separated list of Prometheus labels to select from (default "instance,job")
  -port string
        Port to run the server on (default "9193")
  -prometheus-url string
        Prometheus URL (default "http://prometheus.foo.bar")
```

```bash
> ./asanager --port=8080 --prometheus-url=http://prometheus.example.com --alertmanager-url=http://alertmanager.example.com
```

## Running as a Service

A systemd service file is provided in the repository:

```bash
> sudo cp asanager.service /etc/systemd/system/

# Edit the service file to match your environment
> sudo systemctl edit asanager.service

> sudo systemctl daemon-reload
> sudo systemctl enable --now asanager.service
```

The systemd service file expext the binary to be installed at `/usr/local/bin/asanager`.


## API Requirements

This application interacts with the following APIs:

1. Prometheus API:
   - `/api/v1/label/{label}/values` - To fetch label values

2. Alertmanager API:
   - `/api/v2/silences` - To create new silences
