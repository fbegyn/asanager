// Configuration and state management
let config = {
  prometheusUrl: "/api/prometheus", // Use local proxy endpoint
  alertmanagerUrl: "/api/alertmanager", // Use local proxy endpoint
  labels: [], // Will be populated from server config
};

// Cache for label values
const labelCache = {};

// Fuse.js instances for fuzzy search
const fuseInstances = {};

// DOM elements
const elements = {
  createSilence: document.getElementById("create-silence"),
  matchersPreview: document.getElementById("matchers-preview"),
  response: document.getElementById("response"),
  silenceDuration: document.getElementById("silence-duration"),
  silenceComment: document.getElementById("silence-comment"),
  creator: document.getElementById("creator"),
};

// Initialize the application
document.addEventListener("DOMContentLoaded", () => {
  // Fetch server config to get dynamic labels
  fetchServerConfig().then(() => {
    // Create dynamic UI for labels that are not in the hardcoded HTML
    createDynamicLabelUI();

    // Initialize event listeners
    initEventListeners();

    // Fetch label values from Prometheus
    fetchLabelValues();
  });
});

// Fetch server configuration with dynamic labels
async function fetchServerConfig() {
  try {
    const response = await fetch("/api/config");
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    const data = await response.json();

    if (data.labels) {
      // Parse the comma-separated list of labels
      config.labels = data.labels.split(",").map((label) => label.trim());

      // Initialize label cache for each label
      config.labels.forEach((label) => {
        labelCache[label] = [];
      });

      console.log("Labels loaded from server config:", config.labels);
    } else {
      // Fallback to default labels if not provided
      config.labels = ["instance", "job"];
      config.labels.forEach((label) => {
        labelCache[label] = [];
      });
      console.log("Using default labels:", config.labels);
    }
  } catch (error) {
    console.error("Error fetching server config:", error);
    // Fallback to default labels
    config.labels = ["instance", "job"];
    config.labels.forEach((label) => {
      labelCache[label] = [];
    });
    console.log("Using default labels due to error:", config.labels);
  }
}

// Create UI elements for labels in the label-selectors-container
function createDynamicLabelUI() {
  // Get the container where we'll add the label selectors
  const labelSelectorsContainer = document.getElementById(
    "label-selectors-container",
  );
  if (!labelSelectorsContainer) {
    console.error("Label selectors container not found");
    return;
  }

  // Clear any existing content
  labelSelectorsContainer.innerHTML = "";

  // Create a form row for each label
  config.labels.forEach((label) => {
    // Create a new form row for this label
    const formRow = document.createElement("div");
    formRow.className = "form-row";

    // Create the label container
    const labelContainer = document.createElement("div");
    labelContainer.className = "form-group select-container";
    labelContainer.innerHTML = `
      <label for="${label}">${label.charAt(0).toUpperCase() + label.slice(1)}:</label>
      <input type="text" id="${label}-search" placeholder="Search..." class="fuzzy-search">
      <div class="dropdown-container">
        <select id="${label}" size="5" class="label-select"></select>
      </div>
      <div id="${label}-loading" class="loading-indicator">Loading...</div>
    `;

    // Add the label container to the form row
    formRow.appendChild(labelContainer);

    // Add the form row to the label selectors container
    labelSelectorsContainer.appendChild(formRow);
  });
}

function initEventListeners() {
  elements.createSilence.addEventListener("click", createSilence);

  // For each label type, initialize search and select functionality
  config.labels.forEach((labelKey) => {
    const id = labelKey;
    const searchInput = document.getElementById(`${id}-search`);
    const select = document.getElementById(id);

    if (searchInput && select) {
      searchInput.addEventListener("input", () => {
        const searchValue = searchInput.value.trim();
        if (fuseInstances[labelKey] && searchValue) {
          const results = fuseInstances[labelKey].search(searchValue);
          populateSelect(
            select,
            results.map((result) => result.item),
          );
        } else {
          populateSelect(select, labelCache[labelKey]);
        }
      });

      select.addEventListener("change", updateMatchersPreview);
    } else {
      console.warn(`UI elements for label ${labelKey} not found in the DOM`);
    }
  });
}

// Fetch label values from Prometheus
function fetchLabelValues() {
  config.labels.forEach((label) => {
    const id = label;
    const loadingIndicator = document.getElementById(`${id}-loading`);
    const select = document.getElementById(id);

    if (!select) {
      console.warn(`Select element for label ${label} not found`);
      return;
    }

    // Show loading indicator if it exists
    if (loadingIndicator) {
      loadingIndicator.style.display = "block";
    }

    // Fetch values from Prometheus via proxy
    fetch(`${config.prometheusUrl}/api/v1/label/${label}/values`)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        return response.json();
      })
      .then((data) => {
        if (data.status === "success" && Array.isArray(data.data)) {
          // Store in cache
          labelCache[label] = data.data.sort();

          // Initialize Fuse.js for this label
          fuseInstances[label] = new Fuse(labelCache[label], {
            threshold: 0.3,
            distance: 100,
          });

          // Populate select
          populateSelect(select, labelCache[label]);
        } else {
          throw new Error("Invalid response format from Prometheus");
        }
      })
      .catch((error) => {
        console.error(`Error fetching ${label} values:`, error);
        elements.response.textContent = `Error fetching ${label} values: ${error.message}`;

        if (loadingIndicator) {
          loadingIndicator.style.display = "none";
        }

        // Try to help diagnose CORS issues
        elements.response.textContent +=
          "\n\nIf you're seeing CORS errors, make sure you're running the app with the provided Go server.";
        elements.response.textContent +=
          "\nThis application should handle CORS automatically.";
      })
      .finally(() => {
        // Hide loading indicator
        if (loadingIndicator) {
          loadingIndicator.style.display = "none";
        }
      });
  });
}

// Populate select element with options
function populateSelect(select, values) {
  // Clear existing options
  select.innerHTML = "";

  // Add options
  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  });
}

// Update the matchers preview
function updateMatchersPreview() {
  const selectedMatchers = getSelectedMatchers();

  if (selectedMatchers.length > 0) {
    const preview = selectedMatchers
      .map((matcher) => `${matcher.name}="${matcher.value}"`)
      .join("\n");

    elements.matchersPreview.textContent = preview;
  } else {
    elements.matchersPreview.textContent =
      "No matchers selected. Please select at least one label value.";
  }
}

// Get selected matchers from the dropdowns
function getSelectedMatchers() {
  const matchers = [];

  // Check all configured labels
  config.labels.forEach((label) => {
    const select = document.getElementById(label);
    if (select && select.selectedIndex !== -1) {
      matchers.push({
        name: label,
        value: select.value,
        isRegex: false,
        isEqual: true,
      });
    }
  });

  return matchers;
}

// Create a silence in Alertmanager
function createSilence() {
  const matchers = getSelectedMatchers();

  if (matchers.length === 0) {
    showNotification("Please select at least one label value.", "error");
    return;
  }

  const comment = elements.silenceComment.value.trim();
  if (!comment) {
    showNotification("Please provide a comment for the silence.", "error");
    return;
  }

  const creator = elements.creator.value.trim();
  if (!creator) {
    showNotification("Please provide your name as the creator.", "error");
    return;
  }

  // Calculate start and end times
  const startsAt = new Date();
  const duration = elements.silenceDuration.value;
  const endsAt = new Date(startsAt.getTime() + parseDuration(duration));

  // Create silence payload
  const silencePayload = {
    matchers: matchers,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    createdBy: creator,
    comment: comment,
    status: {
      state: "active",
    },
  };

  // Display in response box
  elements.response.textContent = "Sending request to Alertmanager...\n";
  elements.response.textContent += JSON.stringify(silencePayload, null, 2);
  elements.response.textContent += `\n\nSending to: ${config.alertmanagerUrl}/silences`;

  // Send request to Alertmanager via proxy
  fetch(`${config.alertmanagerUrl}/api/v2/silences`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(silencePayload),
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      return response.json();
    })
    .then((data) => {
      elements.response.textContent +=
        "\n\nSuccess! Silence created with ID:\n" + data.silenceID;
      showNotification("Silence created successfully!", "success");
    })
    .catch((error) => {
      console.error("Error creating silence:", error);
      elements.response.textContent +=
        "\n\nError creating silence: " + error.message;
      showNotification("Error creating silence: " + error.message, "error");
    });
}

// Parse duration string to milliseconds
function parseDuration(durationStr) {
  const number = parseInt(durationStr, 10);
  const unit = durationStr.slice(String(number).length);

  switch (unit) {
    case "h":
      return number * 60 * 60 * 1000; // hours to ms
    case "d":
      return number * 24 * 60 * 60 * 1000; // days to ms
    case "w":
      return number * 7 * 24 * 60 * 60 * 1000; // weeks to ms
    default:
      return number * 60 * 60 * 1000; // default to hours
  }
}

// Show notification to user
function showNotification(message, type = "info") {
  // Check if notification container exists
  let container = document.querySelector(".notification-container");
  if (!container) {
    container = document.createElement("div");
    container.className = "notification-container";
    document.body.appendChild(container);

    // Add styles for notification container
    const style = document.createElement("style");
    style.textContent = `
            .notification-container {
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 1000;
            }
            .notification {
                margin-bottom: 10px;
                padding: 15px 20px;
                border-radius: 4px;
                box-shadow: 0 3px 6px rgba(0,0,0,0.16);
                animation: slide-in 0.3s ease-out forwards;
                max-width: 300px;
            }
            .notification.info {
                background-color: #3498db;
                color: white;
            }
            .notification.success {
                background-color: #27ae60;
                color: white;
            }
            .notification.error {
                background-color: #e74c3c;
                color: white;
            }
            @keyframes slide-in {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            @keyframes fade-out {
                from { opacity: 1; }
                to { opacity: 0; }
            }
        `;
    document.head.appendChild(style);
  }

  // Create notification
  const notification = document.createElement("div");
  notification.className = `notification ${type}`;
  notification.textContent = message;

  // Add to container
  container.appendChild(notification);

  // Remove after delay
  setTimeout(() => {
    notification.style.animation = "fade-out 0.3s ease-out forwards";
    setTimeout(() => {
      notification.remove();
    }, 300);
  }, 3000);
}
