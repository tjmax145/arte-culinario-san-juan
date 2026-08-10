const express = require("express");
const session = require("express-session");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();

const PORT = process.env.PORT || 3000;

const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASSWORD =
  process.env.ADMIN_PASSWORD || "CAMBIAR_CONTRASENA";

const SESSION_SECRET =
  process.env.SESSION_SECRET || "CAMBIAR_SESSION_SECRET";

const DATA_DIR = path.join(__dirname, "data");
const UPLOAD_DIR = path.join(__dirname, "uploads");
const RECIPES_FILE = path.join(DATA_DIR, "recipes.json");

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

if (!fs.existsSync(RECIPES_FILE)) {
  fs.writeFileSync(RECIPES_FILE, "[]");
}

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 1000 * 60 * 60 * 8
    }
  })
);

app.use("/uploads", express.static(UPLOAD_DIR));
app.use(express.static(path.join(__dirname, "public")));

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOAD_DIR);
  },

  filename: function (req, file, cb) {
    const extension = path.extname(file.originalname).toLowerCase();

    const filename =
      Date.now() +
      "-" +
      crypto.randomBytes(6).toString("hex") +
      extension;

    cb(null, filename);
  }
});

const upload = multer({
  storage: storage,

  limits: {
    fileSize: 5 * 1024 * 1024
  },

  fileFilter: function (req, file, cb) {
    const allowed = [
      "image/jpeg",
      "image/png",
      "image/webp"
    ];

    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Solo se permiten imágenes JPG, PNG o WEBP."));
    }
  }
});

function readRecipes() {
  try {
    return JSON.parse(
      fs.readFileSync(RECIPES_FILE, "utf8")
    );
  } catch {
    return [];
  }
}

function writeRecipes(recipes) {
  fs.writeFileSync(
    RECIPES_FILE,
    JSON.stringify(recipes, null, 2)
  );
}

function requireAuth(req, res, next) {
  if (req.session.authenticated) {
    return next();
  }

  return res.status(401).json({
    error: "No autorizado."
  });
}

/* =========================
   RECETAS PÚBLICAS
========================= */

app.get("/api/recipes", (req, res) => {
  const recipes = readRecipes();

  res.json(recipes);
});

/* =========================
   LOGIN
========================= */

app.post("/api/login", (req, res) => {
  const username = req.body.username;
  const password = req.body.password;

  if (
    username === ADMIN_USER &&
    password === ADMIN_PASSWORD
  ) {
    req.session.authenticated = true;
    
    return res.json({
      ok: true
    });
  }
  
  return res.status(401).json({
    error: "Usuario o contraseña incorrectos."
  });
});

/* =========================
   LOGOUT
========================= */

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({
      ok: true
    });
  });
});

/* =========================
   ESTADO DE SESIÓN
========================= */

app.get("/api/me", (req, res) => {
  res.json({
    authenticated: !!req.session.authenticated
  });
  sessionID: req.sessionID

  res.json({
    authenticated: !!req.session.authenticated
  });
});

/* =========================
   CREAR RECETA
========================= */

app.post(
  "/api/recipes",
  requireAuth,
  upload.single("image"),
  (req, res) => {
    const {
      title,
      description,
      time,
      difficulty,
      ingredients,
      instructions
    } = req.body;

    if (!title || !ingredients || !instructions) {
      return res.status(400).json({
        error:
          "Título, ingredientes e instrucciones son obligatorios."
      });
    }

    const recipes = readRecipes();

    const recipe = {
      id: crypto.randomUUID(),

      title: title.trim(),

      description:
        (description || "").trim(),

      time:
        (time || "").trim(),

      difficulty:
        (difficulty || "").trim(),

      ingredients:
        ingredients.trim(),

      instructions:
        instructions.trim(),

      image:
        req.file
          ? `/uploads/${req.file.filename}`
          : "",

      createdAt:
        new Date().toISOString()
    };

    recipes.unshift(recipe);

    writeRecipes(recipes);

    res.status(201).json(recipe);
  }
);

/* =========================
   EDITAR RECETA
========================= */

app.put(
  "/api/recipes/:id",
  requireAuth,
  upload.single("image"),
  (req, res) => {
    const recipes = readRecipes();

    const index = recipes.findIndex(
      recipe => recipe.id === req.params.id
    );

    if (index === -1) {
      return res.status(404).json({
        error: "Receta no encontrada."
      });
    }

    const oldRecipe = recipes[index];

    recipes[index] = {
      ...oldRecipe,

      title:
        (req.body.title || oldRecipe.title).trim(),

      description:
        (
          req.body.description ??
          oldRecipe.description
        ).trim(),

      time:
        (
          req.body.time ??
          oldRecipe.time
        ).trim(),

      difficulty:
        (
          req.body.difficulty ??
          oldRecipe.difficulty
        ).trim(),

      ingredients:
        (
          req.body.ingredients ||
          oldRecipe.ingredients
        ).trim(),

      instructions:
        (
          req.body.instructions ||
          oldRecipe.instructions
        ).trim()
    };

    if (req.file) {
      recipes[index].image =
        `/uploads/${req.file.filename}`;
    }

    writeRecipes(recipes);

    res.json(recipes[index]);
  }
);

/* =========================
   ELIMINAR RECETA
========================= */

app.delete(
  "/api/recipes/:id",
  requireAuth,
  (req, res) => {
    const recipes = readRecipes();

    const recipe = recipes.find(
      item => item.id === req.params.id
    );

    if (!recipe) {
      return res.status(404).json({
        error: "Receta no encontrada."
      });
    }

    const updatedRecipes =
      recipes.filter(
        item => item.id !== req.params.id
      );

    writeRecipes(updatedRecipes);

    res.json({
      ok: true
    });
  }
);

/* =========================
   PANEL ADMIN
========================= */

app.get("/admin", (req, res) => {
  res.sendFile(
    path.join(
      __dirname,
      "public",
      "admin.html"
    )
  );
});

/* =========================
   SERVIDOR
========================= */

app.listen(PORT, () => {
  console.log(
    `Arte Culinario funcionando en el puerto ${PORT}`
  );
});
