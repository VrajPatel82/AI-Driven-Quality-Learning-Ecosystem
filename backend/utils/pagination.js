/**
 * Pagination utility for Mongoose queries
 * @param {Object} query - Mongoose query object
 * @param {Object} options - { page, limit, sort }
 * @returns {Object} - { data, pagination }
 */
const paginate = async (model, filter = {}, options = {}, populate = []) => {
  const page = Math.max(1, parseInt(options.page) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(options.limit) || 20));
  const sort = options.sort || { createdAt: -1 };
  const skip = (page - 1) * limit;

  const [totalItems, data] = await Promise.all([
    model.countDocuments(filter),
    (() => {
      let query = model.find(filter).sort(sort).skip(skip).limit(limit);
      populate.forEach(p => { query = query.populate(p); });
      if (options.select) query = query.select(options.select);
      return query.exec();
    })()
  ]);

  const totalPages = Math.ceil(totalItems / limit);

  return {
    data,
    pagination: {
      currentPage: page,
      totalPages,
      totalItems,
      limit,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1
    }
  };
};

module.exports = { paginate };
