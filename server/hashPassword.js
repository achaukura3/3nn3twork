const bcrypt = require('bcrypt');

const plainTextPassword = '84town65'; // The password to hash

async function generateHash() {
  try {
    const saltRounds = 10; // The higher the salt rounds, the stronger the hash (but slower)
    const hashedPassword = await bcrypt.hash(plainTextPassword, saltRounds);
    console.log('Hashed Password:', hashedPassword);
  } catch (error) {
    console.error('Error hashing password:', error);
  }
}

generateHash();