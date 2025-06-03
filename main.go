package main

import (
	"embed"
	"encoding/json"
	"flag"
	"io/fs"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"strings"
)

//go:embed index.html script.js styles.css favicon.ico
var staticFiles embed.FS

type ConfigPayload struct {
	Labels                string `json:"labels"`
	AlertmanagerServerURL string `json:"alertmanager_url"`
}

func main() {
	// Get configuration from environment variables or use defaults
	port := os.Getenv("PORT")
	if port == "" {
		port = "9193"
	}

	prometheusURL := os.Getenv("PROMETHEUS_URL")
	if prometheusURL == "" {
		prometheusURL = "http://prometheus.foo.bar"
	}

	alertmanagerURL := os.Getenv("ALERTMANAGER_URL")
	if alertmanagerURL == "" {
		alertmanagerURL = "http://alertmanager.foo.bar"
	}

	// Get label selector from environment variable
	labelSelector := os.Getenv("LABEL_SELECTOR")
	if labelSelector == "" {
		labelSelector = "instance,job"
	}

	// Parse command line flags (alternative to env vars)
	portFlag := flag.String("port", port, "Port to run the server on")
	prometheusURLFlag := flag.String("prometheus-url", prometheusURL, "Prometheus URL")
	alertmanagerURLFlag := flag.String("alertmanager-url", alertmanagerURL, "Alertmanager URL")
	labelSelectorFlag := flag.String("label-selector", labelSelector, "Comma-separated list of Prometheus labels to select from")
	flag.Parse()

	// Command line flags take precedence over env vars
	port = *portFlag
	prometheusURL = *prometheusURLFlag
	alertmanagerURL = *alertmanagerURLFlag
	labelSelector = *labelSelectorFlag

	// Create HTTP multiplexer
	mux := http.NewServeMux()

	// Set up routes for static files
	fsys, err := fs.Sub(staticFiles, ".")
	if err != nil {
		log.Fatal("Failed to create sub filesystem:", err)
	}
	fileServer := http.FileServer(http.FS(fsys))
	mux.Handle("/", fileServer)

	cfgPayload := ConfigPayload{
		Labels:                labelSelector,
		AlertmanagerServerURL: alertmanagerURL,
	}

	// Add config endpoint to provide labels to the frontend
	mux.HandleFunc("/api/config", func(w http.ResponseWriter, r *http.Request) {
		jsonw := json.NewEncoder(w)
		w.Header().Set("Content-Type", "application/json")
		jsonw.Encode(cfgPayload)
	})

	// Set up reverse proxy for Prometheus API
	prometheusProxy := createReverseProxy("/api/prometheus", prometheusURL, "/api/v1")
	mux.Handle("/api/prometheus/", prometheusProxy)

	// Set up reverse proxy for Alertmanager API
	alertmanagerProxy := createReverseProxy("/api/alertmanager", alertmanagerURL, "/api/v2")
	mux.Handle("/api/alertmanager/", alertmanagerProxy)

	// Create server with CORS middleware
	server := corsMiddleware(mux)

	// Start the server
	log.Printf("Silence Manager server running on port %s", port)
	log.Printf("Proxying Prometheus requests to: %s", prometheusURL)
	log.Printf("Proxying Alertmanager requests to: %s", alertmanagerURL)
	log.Printf("Using label selector: %s", labelSelector)
	log.Fatal(http.ListenAndServe(":"+port, server))
}

// createReverseProxy creates a reverse proxy handler
func createReverseProxy(path, targetURL, targetPath string) http.Handler {
	target, err := url.Parse(targetURL)
	if err != nil {
		log.Fatalf("Invalid URL: %v", err)
	}

	proxy := httputil.NewSingleHostReverseProxy(target)

	// Customize the director to change the request path
	originalDirector := proxy.Director
	proxy.Director = func(req *http.Request) {
		originalDirector(req)

		// Replace the path prefix
		req.URL.Path = strings.Replace(req.URL.Path, path, targetPath, 1)

		// Set the Host header to the target host
		req.Host = target.Host

		log.Printf("Proxying request: %s -> %s", req.URL.Path, req.URL.String())
	}

	return http.StripPrefix(path, proxy)
}

// corsMiddleware adds CORS headers to all responses
func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Set CORS headers
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		// Handle preflight requests
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		// Serve the request
		next.ServeHTTP(w, r)
	})
}
