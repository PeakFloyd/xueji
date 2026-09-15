package xueji.dao;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;

import xueji.db.DbUtil;
import xueji.entity.GraduationRequirement;

/**
 * 毕业学分要求 数据访问对象(DAO)。
 *
 * <p>每系一条记录。主键为系号，故「修改」只改学分值，不修改主键。</p>
 */
public class GraduationRequirementDao {

    /**
     * 查询所有系的毕业学分要求（联表带出系名）。
     *
     * @return 每行以 Object[] 表示 [deptId, deptName, requiredCredit]
     */
    public List<Object[]> findAllWithDeptName() {
        List<Object[]> list = new ArrayList<>();
        String sql = "SELECT g.dept_id, d.dept_name, g.required_credit "
                + "FROM graduation_requirement g "
                + "JOIN department d ON d.dept_id = g.dept_id ORDER BY g.dept_id";
        try (Connection conn = DbUtil.getConnection();
             Statement st = conn.createStatement();
             ResultSet rs = st.executeQuery(sql)) {
            while (rs.next()) {
                list.add(new Object[]{
                        rs.getString("dept_id"),
                        rs.getString("dept_name"),
                        rs.getInt("required_credit")
                });
            }
        } catch (Exception e) {
            throw new RuntimeException("查询毕业要求失败", e);
        }
        return list;
    }

    /**
     * 新增一条毕业要求。
     *
     * @param g 毕业要求实体
     * @return 影响行数
     */
    public int insert(GraduationRequirement g) {
        String sql = "INSERT INTO graduation_requirement(dept_id, required_credit) VALUES(?, ?)";
        try (Connection conn = DbUtil.getConnection();
             PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setString(1, g.getDeptId());
            ps.setInt(2, g.getRequiredCredit());
            return ps.executeUpdate();
        } catch (Exception e) {
            throw new RuntimeException("新增毕业要求失败（系号不存在或已有记录）", e);
        }
    }

    /**
     * 更新某系的毕业学分要求。
     *
     * @param g 含系号与新学分的实体
     * @return 影响行数
     */
    public int update(GraduationRequirement g) {
        String sql = "UPDATE graduation_requirement SET required_credit = ? WHERE dept_id = ?";
        try (Connection conn = DbUtil.getConnection();
             PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setInt(1, g.getRequiredCredit());
            ps.setString(2, g.getDeptId());
            return ps.executeUpdate();
        } catch (Exception e) {
            throw new RuntimeException("更新毕业要求失败", e);
        }
    }

    /**
     * 删除某系的毕业要求。
     *
     * @param deptId 系号
     * @return 影响行数
     */
    public int delete(String deptId) {
        String sql = "DELETE FROM graduation_requirement WHERE dept_id = ?";
        try (Connection conn = DbUtil.getConnection();
             PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setString(1, deptId);
            return ps.executeUpdate();
        } catch (Exception e) {
            throw new RuntimeException("删除毕业要求失败", e);
        }
    }
}
