const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'El nombre es requerido'],
    trim: true,
    minlength: [2, 'El nombre debe tener al menos 2 caracteres'],
    maxlength: [50, 'El nombre no puede exceder 50 caracteres']
  },
  email: {
    type: String,
    required: [true, 'El email es requerido'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Por favor ingresa un email válido']
  },
  password: {
    type: String,
    required: [true, 'La contraseña es requerida'],
    minlength: [6, 'La contraseña debe tener al menos 6 caracteres']
  },
  avatar: {
    type: String,
    default: null
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  // Nuevos campos para enriquecer el perfil
  bio: {
    type: String,
    maxlength: [500, 'La biografía no puede exceder 500 caracteres'],
    default: '',
    trim: true
  },
  phone: {
    type: String,
    match: [/^[+]?[0-9\s-()]+$/, 'Número de teléfono inválido'],
    trim: true
  },
  location: {
    type: String,
    maxlength: [100, 'La ubicación no puede exceder 100 caracteres'],
    trim: true
  },
  company: {
    type: String,
    maxlength: [100, 'El nombre de la empresa no puede exceder 100 caracteres'],
    trim: true
  },
  website: {
    type: String,
    validate: {
      validator: function(v) {
        if (!v) return true; // Campo opcional
        return /^https?:\/\/.+/.test(v);
      },
      message: 'El sitio web debe ser una URL válida'
    },
    trim: true
  },
  lastLogin: {
    type: Date,
    default: Date.now
  },
  preferences: {
    theme: {
      type: String,
      enum: ['light', 'dark', 'auto'],
      default: 'auto'
    },
    language: {
      type: String,
      enum: ['es', 'en'],
      default: 'es'
    },
    notifications: {
      email: { type: Boolean, default: true },
      push: { type: Boolean, default: true },
      projectUpdates: { type: Boolean, default: true },
      weeklyDigest: { type: Boolean, default: false }
    },
    timezone: {
      type: String,
      default: 'America/Mexico_City'
    }
  },
  // Estadísticas del usuario
  stats: {
    totalProjects: {
      type: Number,
      default: 0
    },
    completedProjects: {
      type: Number,
      default: 0
    },
    totalUserStories: {
      type: Number,
      default: 0
    },
    completedUserStories: {
      type: Number,
      default: 0
    }
  }
}, {
  timestamps: true
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Transform output
userSchema.methods.toJSON = function() {
  const userObject = this.toObject();
  delete userObject.password;
  return userObject;
};

// Virtual para obtener proyectos del usuario
userSchema.virtual('projects', {
  ref: 'Project',
  localField: '_id',
  foreignField: 'userId'
});

// Virtual para obtener proyectos activos
userSchema.virtual('activeProjects', {
  ref: 'Project',
  localField: '_id',
  foreignField: 'userId',
  match: { isActive: true }
});

// Método para actualizar estadísticas del usuario
userSchema.methods.updateStats = async function() {
  const Project = mongoose.model('Project');
  
  const projects = await Project.find({ userId: this._id, isActive: true });
  
  this.stats.totalProjects = projects.length;
  this.stats.completedProjects = projects.filter(p => p.status === 'completed').length;
  
  // Calcular user stories totales y completadas
  let totalUserStories = 0;
  let completedUserStories = 0;
  
  projects.forEach(project => {
    project.pages.forEach(page => {
      totalUserStories += page.userStories.length;
      completedUserStories += page.userStories.filter(story => story.status === 'completed').length;
    });
  });
  
  this.stats.totalUserStories = totalUserStories;
  this.stats.completedUserStories = completedUserStories;
  
  return this.save();
};

// Índices para mejor rendimiento
userSchema.index({ email: 1 });
userSchema.index({ isActive: 1 });
userSchema.index({ 'stats.totalProjects': -1 });

module.exports = mongoose.model('User', userSchema);