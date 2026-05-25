'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. Relax game_tile_placements.game_node_id: drop unique index, add a plain index.
    await queryInterface.removeIndex(
      'game_tile_placements',
      'game_tile_placements_game_node_id_unique',
    );
    await queryInterface.addIndex('game_tile_placements', ['game_node_id'], {
      name: 'game_tile_placements_game_node_id_idx',
    });

    // 2. map_templates: configurable defaults. `default_slots_per_node` is the
    //    template's notion of capacity at each node; lobbies/games inherit it as
    //    `slots_per_node` (capacity, not realized tile count).
    await queryInterface.addColumn('map_templates', 'default_slots_per_node', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 1,
    });
    await queryInterface.addColumn(
      'map_templates',
      'default_visibility_phase_count',
      {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 4,
      },
    );

    // 3. lobbies: configurable per-lobby (sourced from map_template defaults).
    //    "slots_per_node" is the capacity the dealer fills at each node; the actual
    //    tile count at a node is dynamic and derived from `game_tile_placements`.
    await queryInterface.addColumn('lobbies', 'slots_per_node', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 1,
    });
    await queryInterface.addColumn('lobbies', 'visibility_phase_count', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 4,
    });

    // 4. games: snapshot of the lobby values at start.
    await queryInterface.addColumn('games', 'slots_per_node', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 1,
    });
    await queryInterface.addColumn('games', 'visibility_phase_count', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 4,
    });

    // 5. lobby_notifications: host-managed schedule of static templates.
    await queryInterface.createTable('lobby_notifications', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      lobby_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'lobbies', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      at_seconds: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      template: {
        type: Sequelize.STRING(64),
        allowNull: false,
      },
      data: {
        type: Sequelize.JSONB,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    await queryInterface.sequelize.query(`
      ALTER TABLE lobby_notifications
      ADD CONSTRAINT lobby_notifications_at_seconds_nonnegative
      CHECK (at_seconds >= 0);
    `);

    await queryInterface.addIndex('lobby_notifications', ['lobby_id', 'at_seconds'], {
      name: 'lobby_notifications_lobby_at_seconds_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex(
      'lobby_notifications',
      'lobby_notifications_lobby_at_seconds_idx',
    );
    await queryInterface.sequelize.query(`
      ALTER TABLE lobby_notifications
      DROP CONSTRAINT IF EXISTS lobby_notifications_at_seconds_nonnegative;
    `);
    await queryInterface.dropTable('lobby_notifications');

    await queryInterface.removeColumn('games', 'visibility_phase_count');
    await queryInterface.removeColumn('games', 'slots_per_node');

    await queryInterface.removeColumn('lobbies', 'visibility_phase_count');
    await queryInterface.removeColumn('lobbies', 'slots_per_node');

    await queryInterface.removeColumn('map_templates', 'default_visibility_phase_count');
    await queryInterface.removeColumn('map_templates', 'default_slots_per_node');

    await queryInterface.removeIndex(
      'game_tile_placements',
      'game_tile_placements_game_node_id_idx',
    );
    await queryInterface.addIndex('game_tile_placements', ['game_node_id'], {
      unique: true,
      name: 'game_tile_placements_game_node_id_unique',
    });
  },
};
