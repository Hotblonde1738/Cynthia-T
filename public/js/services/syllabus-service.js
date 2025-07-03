// SYLLABUS SERVICE - Unified Syllabus Management for Authenticated & Non-Authenticated Users
console.log("📚 SYLLABUS SERVICE LOADING...");

class SyllabusService {
  constructor() {
    this.uploadedSyllabi = [];
    this.maxFileSize = 5 * 1024 * 1024; // 5MB
    this.allowedTypes = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];
    this.maxSyllabiPerUser = 10;

    // Unified storage management
    this.storageMode = "local"; // 'local' or 'database'
    this.sessionId = this.getOrCreateSessionId();
    this.userId = null;
    this.isAuthenticated = false;

    // Initialize storage mode detection
    this.detectStorageMode();
  }

  // Detect if user is authenticated and set storage mode
  detectStorageMode() {
    // Check for authentication token or user session
    const authToken = localStorage.getItem("smartypants_auth_token");
    const userData = localStorage.getItem("smartypants_user_data");

    if (authToken && userData) {
      try {
        const user = JSON.parse(userData);
        this.userId = user.id || user.email;
        this.isAuthenticated = true;
        this.storageMode = "database";
        console.log("🔐 Authenticated user detected, using database storage");
      } catch (error) {
        console.warn("⚠️ Invalid user data, falling back to local storage");
        this.storageMode = "local";
      }
    } else {
      this.storageMode = "local";
      console.log("👤 Non-authenticated user, using local storage");
    }
  }

  // Get or create session ID for non-authenticated users
  getOrCreateSessionId() {
    let sessionId = localStorage.getItem("smartypants_session_id");
    if (!sessionId) {
      sessionId =
        "session_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
      localStorage.setItem("smartypants_session_id", sessionId);
    }
    return sessionId;
  }

  // Upload syllabus file - unified interface
  async uploadSyllabus(file) {
    console.log("📚 Uploading syllabus:", file.name, "Mode:", this.storageMode);
    console.log("🔍 Service state:", {
      storageMode: this.storageMode,
      isAuthenticated: this.isAuthenticated,
      userId: this.userId,
      sessionId: this.sessionId,
    });

    try {
      // Validate file
      console.log("🔍 Validating file...");
      this.validateFile(file);
      console.log("✅ File validation passed");

      // Create syllabus record
      console.log("🔍 Creating syllabus record...");
      const syllabus = this.createSyllabusRecord(file);
      console.log("✅ Syllabus record created:", syllabus);

      // Store based on authentication status
      if (this.storageMode === "database") {
        console.log("🔄 Saving to database...");
        await this.saveToDatabase(syllabus);
      } else {
        console.log("💾 Using local storage only");
      }

      // Always save to local storage (as cache or primary storage)
      console.log("💾 Saving to local storage...");
      this.saveToLocalStorage(syllabus);

      // Add to local collection
      this.uploadedSyllabi.push(syllabus);
      console.log("📚 Added to local collection");

      console.log("✅ Syllabus uploaded successfully:", syllabus);
      return {
        success: true,
        syllabus: syllabus,
        storageMode: this.storageMode,
      };
    } catch (error) {
      console.error("❌ Syllabus upload failed:", error);
      console.error("❌ Error details:", {
        message: error.message,
        stack: error.stack,
        name: error.name,
      });
      return {
        success: false,
        error: error.message,
      };
    }
  }

  // Save to database (for authenticated users)
  async saveToDatabase(syllabus) {
    try {
      console.log("🔄 Attempting database upload...");

      // For now, we'll send a JSON payload instead of FormData
      // This is simpler and works better with Netlify functions
      const uploadData = {
        userId: this.userId || "anonymous",
        filename: syllabus.filename,
        metadata: JSON.stringify(syllabus.metadata),
        fileSize: syllabus.size,
        fileType: syllabus.type,
      };

      console.log("📤 Upload data:", uploadData);

      const response = await fetch("/.netlify/functions/upload-syllabus", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(uploadData),
      });

      console.log("📥 Response status:", response.status);
      console.log(
        "📥 Response headers:",
        Object.fromEntries(response.headers.entries())
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error("❌ Response error:", errorText);
        throw new Error(
          `Database upload failed: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();
      console.log("✅ Database response:", data);

      syllabus.id = data.id || syllabus.id;
      syllabus.url = data.url;
      syllabus.storageMode = "database";

      console.log("✅ Syllabus saved to database");
    } catch (error) {
      console.warn(
        "⚠️ Database upload failed, using local storage only:",
        error
      );
      syllabus.storageMode = "local";
      // Don't throw - fallback to local storage
    }
  }

  // Save to local storage
  saveToLocalStorage(syllabus) {
    try {
      // Convert file to base64 for localStorage storage
      const reader = new FileReader();
      reader.onload = () => {
        syllabus.fileData = reader.result;
        syllabus.storageMode = "local";
        this.saveSyllabi();
      };
      reader.readAsDataURL(syllabus.file);
    } catch (error) {
      console.error("❌ Failed to save to local storage:", error);
      // Don't throw - just log the error and continue
      syllabus.storageMode = "local";
      this.saveSyllabi();
    }
  }

  // Validate file before upload
  validateFile(file) {
    if (!file) {
      throw new Error("No file selected");
    }

    if (file.size > this.maxFileSize) {
      throw new Error(
        `File size exceeds ${this.maxFileSize / (1024 * 1024)}MB limit`
      );
    }

    if (!this.allowedTypes.includes(file.type)) {
      throw new Error(
        "Invalid file type. Only PDF and Word documents are allowed"
      );
    }

    if (this.uploadedSyllabi.length >= this.maxSyllabiPerUser) {
      throw new Error(
        `Maximum ${this.maxSyllabiPerUser} syllabi allowed per user`
      );
    }

    // Check for duplicate filenames
    const existingFile = this.uploadedSyllabi.find(
      (s) => s.filename === file.name
    );
    if (existingFile) {
      throw new Error("A file with this name already exists");
    }
  }

  // Create syllabus record
  createSyllabusRecord(file) {
    return {
      id: this.generateSyllabusId(),
      filename: file.name,
      originalName: file.name,
      size: file.size,
      type: file.type,
      uploadDate: new Date().toISOString(),
      lastModified: new Date(file.lastModified).toISOString(),
      status: "inactive", // Start as inactive, user can activate
      file: file, // Keep reference to original file
      storageMode: this.storageMode,
      sessionId: this.sessionId,
      userId: this.userId,
      url: null,
      metadata: {
        pages: null,
        wordCount: null,
        extractedText: null,
        subject: this.extractSubjectFromFilename(file.name),
      },
    };
  }

  // Extract subject from filename
  extractSubjectFromFilename(filename) {
    const name = filename.toLowerCase().replace(/\.[^/.]+$/, "");

    // Common subject patterns
    const subjects = {
      math: [
        "math",
        "mathematics",
        "algebra",
        "calculus",
        "geometry",
        "statistics",
      ],
      english: ["english", "literature", "writing", "composition", "grammar"],
      science: ["biology", "chemistry", "physics", "science", "anatomy"],
      history: ["history", "social studies", "geography", "political"],
      computer: ["computer", "programming", "coding", "software", "web"],
      business: ["business", "economics", "accounting", "finance", "marketing"],
      nursing: ["nursing", "health", "medical", "patient", "clinical"],
    };

    for (const [subject, keywords] of Object.entries(subjects)) {
      if (keywords.some((keyword) => name.includes(keyword))) {
        return subject;
      }
    }

    return "general";
  }

  // Remove syllabus
  async removeSyllabus(syllabusId) {
    console.log("📚 Removing syllabus:", syllabusId);

    const index = this.uploadedSyllabi.findIndex((s) => s.id === syllabusId);
    if (index === -1) {
      throw new Error("Syllabus not found");
    }

    const removedSyllabus = this.uploadedSyllabi.splice(index, 1)[0];

    // Remove from database if applicable
    if (removedSyllabus.storageMode === "database") {
      try {
        await fetch(`/.netlify/functions/remove-syllabus`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            syllabusId,
            userId: this.userId,
          }),
        });
      } catch (error) {
        console.warn("⚠️ Failed to remove from database:", error);
      }
    }

    // Always remove from local storage
    this.saveSyllabi();

    console.log("✅ Syllabus removed:", removedSyllabus);
    return {
      success: true,
      syllabus: removedSyllabus,
    };
  }

  // Toggle syllabus active status
  toggleSyllabus(syllabusId) {
    const syllabus = this.getSyllabusById(syllabusId);
    if (!syllabus) {
      throw new Error("Syllabus not found");
    }

    // Deactivate all other syllabi
    this.uploadedSyllabi.forEach((s) => (s.status = "inactive"));

    // Activate the selected syllabus
    syllabus.status = "active";
    syllabus.lastModified = new Date().toISOString();

    this.saveSyllabi();

    return {
      success: true,
      syllabus: syllabus,
    };
  }

  // Get active syllabus
  getActiveSyllabus() {
    return this.uploadedSyllabi.find((s) => s.status === "active");
  }

  // Get all syllabi
  getAllSyllabi() {
    return [...this.uploadedSyllabi];
  }

  // Get syllabus by ID
  getSyllabusById(syllabusId) {
    return this.uploadedSyllabi.find((s) => s.id === syllabusId);
  }

  // Get syllabi by subject (if metadata available)
  getSyllabiBySubject(subject) {
    return this.uploadedSyllabi.filter(
      (s) => s.metadata && s.metadata.subject === subject
    );
  }

  // Update syllabus metadata
  updateSyllabusMetadata(syllabusId, metadata) {
    const syllabus = this.getSyllabusById(syllabusId);
    if (!syllabus) {
      throw new Error("Syllabus not found");
    }

    syllabus.metadata = { ...syllabus.metadata, ...metadata };
    syllabus.lastModified = new Date().toISOString();
    this.saveSyllabi();

    return {
      success: true,
      syllabus: syllabus,
    };
  }

  // Search syllabi by content
  searchSyllabi(query) {
    if (!query || query.trim().length < 2) {
      return [];
    }

    const searchTerm = query.toLowerCase().trim();

    return this.uploadedSyllabi.filter((syllabus) => {
      // Search in filename
      if (syllabus.filename.toLowerCase().includes(searchTerm)) {
        return true;
      }

      // Search in extracted text (if available)
      if (syllabus.metadata && syllabus.metadata.extractedText) {
        return syllabus.metadata.extractedText
          .toLowerCase()
          .includes(searchTerm);
      }

      return false;
    });
  }

  // Get syllabus statistics
  getSyllabusStats() {
    const totalSize = this.uploadedSyllabi.reduce((sum, s) => sum + s.size, 0);
    const fileTypes = this.uploadedSyllabi.reduce((types, s) => {
      types[s.type] = (types[s.type] || 0) + 1;
      return types;
    }, {});

    return {
      totalSyllabi: this.uploadedSyllabi.length,
      totalSize: totalSize,
      totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2),
      fileTypes: fileTypes,
      storageMode: this.storageMode,
      isAuthenticated: this.isAuthenticated,
      oldestUpload:
        this.uploadedSyllabi.length > 0
          ? Math.min(...this.uploadedSyllabi.map((s) => new Date(s.uploadDate)))
          : null,
      newestUpload:
        this.uploadedSyllabi.length > 0
          ? Math.max(...this.uploadedSyllabi.map((s) => new Date(s.uploadDate)))
          : null,
    };
  }

  // Migrate local syllabi to database when user logs in
  async migrateToDatabase() {
    if (this.storageMode !== "database") {
      console.log("⚠️ Not in database mode, skipping migration");
      return { success: false, reason: "Not in database mode" };
    }

    const localSyllabi = this.uploadedSyllabi.filter(
      (s) => s.storageMode === "local"
    );

    if (localSyllabi.length === 0) {
      console.log("✅ No local syllabi to migrate");
      return { success: true, migrated: 0 };
    }

    console.log(`🔄 Migrating ${localSyllabi.length} syllabi to database...`);

    let migratedCount = 0;
    for (const syllabus of localSyllabi) {
      try {
        await this.saveToDatabase(syllabus);
        migratedCount++;
      } catch (error) {
        console.error(`❌ Failed to migrate syllabus ${syllabus.id}:`, error);
      }
    }

    this.saveSyllabi();
    console.log(`✅ Migrated ${migratedCount} syllabi to database`);

    return { success: true, migrated: migratedCount };
  }

  // Export syllabi data
  exportSyllabiData() {
    return {
      syllabi: this.uploadedSyllabi,
      exportDate: new Date().toISOString(),
      stats: this.getSyllabusStats(),
    };
  }

  // Import syllabi data
  importSyllabiData(data) {
    if (!data || !Array.isArray(data.syllabi)) {
      throw new Error("Invalid syllabus data format");
    }

    // Validate each syllabus
    data.syllabi.forEach((syllabus) => {
      if (!syllabus.id || !syllabus.filename) {
        throw new Error("Invalid syllabus record");
      }
    });

    this.uploadedSyllabi = data.syllabi;
    this.saveSyllabi();

    console.log("✅ Syllabus data imported successfully");
    return {
      success: true,
      count: this.uploadedSyllabi.length,
    };
  }

  // Save syllabi to localStorage
  saveSyllabi() {
    try {
      const storageKey = this.isAuthenticated
        ? `smartypants_syllabi_${this.userId}`
        : `smartypants_syllabi_${this.sessionId}`;

      localStorage.setItem(storageKey, JSON.stringify(this.uploadedSyllabi));
      console.log("✅ Syllabi saved to localStorage");
    } catch (error) {
      console.error("❌ Failed to save syllabi:", error);
    }
  }

  // Load syllabi from localStorage
  loadSyllabi() {
    try {
      const storageKey = this.isAuthenticated
        ? `smartypants_syllabi_${this.userId}`
        : `smartypants_syllabi_${this.sessionId}`;

      const data = localStorage.getItem(storageKey);
      this.uploadedSyllabi = data ? JSON.parse(data) : [];
      console.log(
        `📚 Loaded ${this.uploadedSyllabi.length} syllabi from localStorage`
      );
    } catch (error) {
      console.error("❌ Failed to load syllabi:", error);
      this.uploadedSyllabi = [];
    }
  }

  // Clear all syllabi
  clearAllSyllabi() {
    this.uploadedSyllabi = [];
    this.saveSyllabi();
    console.log("✅ All syllabi cleared");
  }

  // Generate unique syllabus ID
  generateSyllabusId() {
    return (
      "SYL-" +
      Date.now() +
      "-" +
      Math.random().toString(36).substr(2, 9).toUpperCase()
    );
  }

  // Validate syllabus data structure
  validateSyllabusData(syllabus) {
    const requiredFields = ["id", "filename", "size", "type", "uploadDate"];

    for (const field of requiredFields) {
      if (!syllabus[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    if (syllabus.size > this.maxFileSize) {
      throw new Error("File size exceeds maximum limit");
    }

    if (!this.allowedTypes.includes(syllabus.type)) {
      throw new Error("Invalid file type");
    }
  }

  // Initialize service
  init() {
    this.loadSyllabi();
    console.log("✅ Syllabus service initialized");
  }

  // Get service configuration
  getConfig() {
    return {
      maxFileSize: this.maxFileSize,
      maxFileSizeMB: this.maxFileSize / (1024 * 1024),
      allowedTypes: this.allowedTypes,
      maxSyllabiPerUser: this.maxSyllabiPerUser,
      storageMode: this.storageMode,
      isAuthenticated: this.isAuthenticated,
      sessionId: this.sessionId,
      userId: this.userId,
    };
  }

  // Update authentication status (called when user logs in/out)
  updateAuthStatus(isAuthenticated, userData = null) {
    this.isAuthenticated = isAuthenticated;

    if (isAuthenticated && userData) {
      this.userId = userData.id || userData.email;
      this.storageMode = "database";
      console.log("🔐 User authenticated, switching to database mode");

      // Migrate existing syllabi to database
      this.migrateToDatabase();
    } else {
      this.userId = null;
      this.storageMode = "local";
      console.log("👤 User logged out, switching to local mode");
    }

    // Reload syllabi with new storage key
    this.loadSyllabi();
  }
}

// Create global instance
console.log("🔧 Creating syllabus service instance...");
window.syllabusService = new SyllabusService();

// Initialize when page loads
document.addEventListener("DOMContentLoaded", () => {
  console.log("📚 Initializing syllabus service on DOM ready...");
  window.syllabusService.init();
});

console.log("✅ SYLLABUS SERVICE LOADED SUCCESSFULLY!");
