require("dotenv").config();

const shared = {
  dialect: "postgres",
  dialectOptions: {
    ssl: process.env.DB_SSL === "true" ? { require: true } : false,
  },
};

module.exports = {
  development: {
    ...shared,
    url: process.env.DATABASE_URL,
  },
  test: {
    ...shared,
    url: process.env.DATABASE_URL_TEST || process.env.DATABASE_URL,
  },
  production: {
    ...shared,
    url: process.env.DATABASE_URL,
  },
};
