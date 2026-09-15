package xueji.dao;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;

import xueji.db.DbUtil;
import xueji.entity.Department;

/**
 * 系 数据访问对象(DAO)。
 *
 * <p>封装对 department 表的增删改查。所有方法内部获取数据库连接并
 * 使用 PreparedStatement 防 SQL 注入。</p>
 */
public class DepartmentDao {

    /**
     * 查询所有系，按系号排序。
     *
     * @return 系列表
     */
    public List<Department> findAll() {
        List<Department> list = new ArrayList<>();
        String sql = "SELECT dept_id, dept_name FROM department ORDER BY dept_id";
        try (Connection conn = DbUtil.getConnection();
             Statement st = conn.createStatement();
             ResultSet rs = st.executeQuery(sql)) {
            while (rs.next()) {
                list.add(mapRow(rs));
            }
        } catch (Exception e) {
            throw new RuntimeException("查询系失败", e);
        }
        return list;
    }

    /**
     * 按系号查询单个系。
     *
     * @param deptId 系号
     * @return 系实体；不存在返回 null
     */
    public Department findById(String deptId) {
        String sql = "SELECT dept_id, dept_name FROM department WHERE dept_id = ?";
        try (Connection conn = DbUtil.getConnection();
             PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setString(1, deptId);
            try (ResultSet rs = ps.executeQuery()) {
                if (rs.next()) {
                    return mapRow(rs);
                }
            }
        } catch (Exception e) {
            throw new RuntimeException("按系号查询失败", e);
        }
        return null;
    }

    /**
     * 新增一个系。
     *
     * @param dept 系实体（系号、系名不可为空）
     * @return 影响行数
     */
    public int insert(Department dept) {
        String sql = "INSERT INTO department(dept_id, dept_name) VALUES(?, ?)";
        try (Connection conn = DbUtil.getConnection();
             PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setString(1, dept.getDeptId());
            ps.setString(2, dept.getDeptName());
            return ps.executeUpdate();
        } catch (Exception e) {
            throw new RuntimeException("新增系失败", e);
        }
    }

    /**
     * 更新一个系（仅可改名，主键不修改）。
     *
     * @param dept 含新系名与系号的系实体
     * @return 影响行数
     */
    public int update(Department dept) {
        String sql = "UPDATE department SET dept_name = ? WHERE dept_id = ?";
        try (Connection conn = DbUtil.getConnection();
             PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setString(1, dept.getDeptName());
            ps.setString(2, dept.getDeptId());
            return ps.executeUpdate();
        } catch (Exception e) {
            throw new RuntimeException("更新系失败", e);
        }
    }

    /**
     * 删除一个系。若其下仍有班级则受外键约束限制无法删除。
     *
     * @param deptId 系号
     * @return 影响行数
     */
    public int delete(String deptId) {
        String sql = "DELETE FROM department WHERE dept_id = ?";
        try (Connection conn = DbUtil.getConnection();
             PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setString(1, deptId);
            return ps.executeUpdate();
        } catch (Exception e) {
            throw new RuntimeException("删除系失败（可能存在关联班级）", e);
        }
    }

    /**
     * 将一行结果映射为系实体。
     */
    private Department mapRow(ResultSet rs) throws Exception {
        Department d = new Department();
        d.setDeptId(rs.getString("dept_id"));
        d.setDeptName(rs.getString("dept_name"));
        return d;
    }
}
